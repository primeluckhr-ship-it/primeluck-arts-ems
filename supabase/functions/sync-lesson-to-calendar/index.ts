// Supabase Edge Function: sync-lesson-to-calendar
// Triggered by DB webhook when a lesson_plan is inserted or updated
// Syncs the lesson to dicearts.academy@gmail.com Google Calendar

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_ID = "dicearts.academy@gmail.com";

// Exchange refresh token for access token
async function getAccessToken(): Promise<string> {
  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const { access_token } = await res.json();
  return access_token;
}

// Build RFC3339 datetime from date string + hour offset
function toRFC3339(dateStr: string, hour: number = 9, mins: number = 0): string {
  const d = new Date(`${dateStr}T${String(hour).padStart(2,"0")}:${String(mins).padStart(2,"0")}:00+03:00`); // EAT = UTC+3
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Payload comes from Supabase DB webhook
  // body.record = the new/updated lesson_plan row
  const record = body.record ?? body;

  if (!record?.lesson_date || !record?.title) {
    return new Response(JSON.stringify({ error: "Missing lesson_date or title" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only sync Dice Arts lessons
  if (record.branch_id !== "dice-arts-nairobi") {
    return new Response(JSON.stringify({ skipped: true, reason: "Not a Dice Arts lesson" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const durationMins = Number(record.duration_minutes ?? 60);
  const startHour = 9; // default 9:00 AM EAT
  const endHour   = startHour + Math.floor(durationMins / 60);
  const endMin    = durationMins % 60;

  // Build event description
  const descParts = [
    record.objectives   ? `🎯 Objectives:\n${record.objectives}`   : "",
    record.materials    ? `📦 Materials:\n${record.materials}`     : "",
    record.activities   ? `🎨 Activities:\n${record.activities}`   : "",
    record.homework     ? `📚 Homework:\n${record.homework}`       : "",
    "\n— Dice Arts Academy Management System",
  ].filter(Boolean);

  const event = {
    summary: record.title,
    description: descParts.join("\n\n"),
    location: "Dice Arts Academy, Nairobi",
    start: {
      dateTime: toRFC3339(record.lesson_date, startHour, 0),
      timeZone: "Africa/Nairobi",
    },
    end: {
      dateTime: toRFC3339(record.lesson_date, endHour, endMin),
      timeZone: "Africa/Nairobi",
    },
    attendees: [{ email: CALENDAR_ID }],
    colorId: "6", // orange = matches Dice Arts brand
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "email", minutes: 60 },
      ],
    },
    extendedProperties: {
      private: {
        lessonPlanId: String(record.id ?? ""),
        source: "dice-arts-ems",
      },
    },
  };

  try {
    const accessToken = await getAccessToken();

    // Check if event already exists (by lessonPlanId in extendedProperties)
    const searchRes = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?privateExtendedProperty=lessonPlanId%3D${record.id}&privateExtendedProperty=source%3Ddice-arts-ems`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const existing = await searchRes.json();
    const existingEvent = existing.items?.[0];

    let calendarRes: Response;
    if (existingEvent) {
      // UPDATE existing event
      calendarRes = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${existingEvent.id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(event),
        }
      );
    } else {
      // CREATE new event
      calendarRes = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(event),
        }
      );
    }

    if (!calendarRes.ok) {
      const errText = await calendarRes.text();
      throw new Error(`Calendar API error: ${errText}`);
    }

    const calEvent = await calendarRes.json();

    return new Response(JSON.stringify({
      success: true,
      action: existingEvent ? "updated" : "created",
      eventId: calEvent.id,
      eventLink: calEvent.htmlLink,
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Calendar sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard } from "@/components/app-shell";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";

export const Route = createFileRoute("/_app/timetable")({ component: TimetablePage });

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am–6pm
const COLORS = [
  "bg-blue-500/20 border-blue-500/40 text-blue-300",
  "bg-purple-500/20 border-purple-500/40 text-purple-300",
  "bg-green-500/20 border-green-500/40 text-green-300",
  "bg-orange-500/20 border-orange-500/40 text-orange-300",
  "bg-pink-500/20 border-pink-500/40 text-pink-300",
  "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
  "bg-cyan-500/20 border-cyan-500/40 text-cyan-300",
];

function TimetablePage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = addDays(weekStart, 6);

  const { data: courses } = useQuery({
    queryKey: ["timetable-courses", user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("courses")
        .select("id,name,start_time,end_time,schedule_days,room,instructors(first_name,last_name)")
        .eq("status","active");
      if (user?.role === "dice_admin") q = q.eq("branch_id", user.branch_id);
      return (await q).data ?? [];
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["timetable-sessions", format(weekStart,"yyyy-MM-dd"), user?.branch_id],
    queryFn: async () => {
      const from = format(weekStart,"yyyy-MM-dd");
      const to   = format(weekEnd,"yyyy-MM-dd");
      const { data } = await supabase.from("sessions")
        .select("*,courses(name,room,instructors(first_name,last_name))")
        .gte("date", from).lte("date", to);
      return data ?? [];
    },
  });

  // Build color map per course
  const courseColors: Record<string,string> = {};
  (courses??[]).forEach((c:any, i:number) => { courseColors[c.id] = COLORS[i % COLORS.length]; });

  // Map sessions by day
  const sessionsByDay: Record<string, any[]> = {};
  DAYS.forEach(d => { sessionsByDay[d] = []; });
  (sessions??[]).forEach((s:any) => {
    const date = new Date(s.date + "T00:00:00");
    const dayIdx = date.getDay(); // 0=Sun
    const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayIdx];
    if (sessionsByDay[dayName]) sessionsByDay[dayName].push(s);
  });

  // Also map recurring courses by schedule_days
  const coursesByDay: Record<string, any[]> = {};
  DAYS.forEach(d => { coursesByDay[d] = []; });
  (courses??[]).forEach((c:any) => {
    (c.schedule_days??[]).forEach((d:string) => {
      if (coursesByDay[d]) coursesByDay[d].push(c);
    });
  });

  function timeToRow(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return (h - 7) * 4 + Math.floor(m / 15); // 15-min slots from 7am
  }
  function duration(start: string, end: string): number {
    const s = timeToRow(start), e = timeToRow(end);
    return Math.max(1, e - s);
  }

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart(w => subWeeks(w,1))} className="p-2 rounded-md hover:bg-muted border border-border">
          <ChevronLeft className="size-4"/>
        </button>
        <div className="text-center">
          <div className="font-semibold">{format(weekStart,"d MMM")} – {format(weekEnd,"d MMM yyyy")}</div>
          <div className="text-xs text-muted-foreground">Week {format(weekStart,"w")}</div>
        </div>
        <button onClick={() => setWeekStart(w => addWeeks(w,1))} className="p-2 rounded-md hover:bg-muted border border-border">
          <ChevronRight className="size-4"/>
        </button>
      </div>

      {/* Mobile: Day cards */}
      <div className="block lg:hidden space-y-3">
        {DAYS.map((day, di) => {
          const date = addDays(weekStart, di);
          const isToday = format(date,"yyyy-MM-dd") === format(new Date(),"yyyy-MM-dd");
          const items = [...(coursesByDay[day]??[]).map((c:any) => ({
            id: c.id, name: c.name, start: c.start_time?.slice(0,5), end: c.end_time?.slice(0,5),
            room: c.room, instructor: c.instructors ? `${c.instructors.first_name} ${c.instructors.last_name}` : "", isCourse: true,
          })), ...(sessionsByDay[day]??[]).filter((s:any) => !s.is_recurring).map((s:any) => ({
            id: s.course_id, name: s.courses?.name, start: s.start_time?.slice(0,5), end: s.end_time?.slice(0,5),
            room: s.courses?.room, instructor: s.courses?.instructors ? `${s.courses.instructors.first_name} ${s.courses.instructors.last_name}` : "", isCourse: false,
          }))].sort((a,b) => (a.start||"").localeCompare(b.start||""));

          return (
            <div key={day} className={`rounded-xl border p-4 ${isToday ? "border-accent bg-accent/5" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">{day}</div>
                <div className={`text-xs ${isToday ? "text-accent font-medium" : "text-muted-foreground"}`}>{format(date,"d MMM")}</div>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No classes</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className={`rounded-lg border p-2.5 text-xs ${courseColors[item.id]??COLORS[0]}`}>
                      <div className="font-semibold">{item.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 opacity-80">
                        <span>{item.start} – {item.end}</span>
                        {item.room && <span>· {item.room}</span>}
                      </div>
                      {item.instructor && <div className="opacity-70 mt-0.5">{item.instructor}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: Grid */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-border bg-card">
        <div className="grid min-w-[900px]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          {/* Header */}
          <div className="border-b border-r border-border p-2 bg-muted/30"/>
          {DAYS.map((day, di) => {
            const date = addDays(weekStart, di);
            const isToday = format(date,"yyyy-MM-dd") === format(new Date(),"yyyy-MM-dd");
            return (
              <div key={day} className={`border-b border-r border-border p-3 text-center ${isToday ? "bg-accent/10" : "bg-muted/20"}`}>
                <div className={`text-sm font-semibold ${isToday ? "text-accent" : ""}`}>{day}</div>
                <div className={`text-xs ${isToday ? "text-accent" : "text-muted-foreground"}`}>{format(date,"d MMM")}</div>
              </div>
            );
          })}
          {/* Time rows */}
          {HOURS.map((hour) => (
            <>
              <div key={`t${hour}`} className="border-b border-r border-border p-2 text-[10px] text-muted-foreground text-right pr-2 pt-1.5">{hour}:00</div>
              {DAYS.map((day, di) => {
                const items = (coursesByDay[day]??[]).filter((c:any) => {
                  const h = parseInt(c.start_time?.split(":")?.[0]??"-1");
                  return h === hour;
                });
                return (
                  <div key={`${day}${hour}`} className="border-b border-r border-border min-h-[48px] p-0.5 relative">
                    {items.map((c:any, i:number) => (
                      <div key={i} className={`rounded px-1.5 py-1 text-[10px] border mb-0.5 ${courseColors[c.id]??COLORS[0]}`}>
                        <div className="font-semibold truncate">{c.name}</div>
                        <div className="opacity-70">{c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)}</div>
                        {c.room && <div className="opacity-60">{c.room}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      {(courses??[]).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(courses??[]).map((c:any, i:number) => (
            <div key={c.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${COLORS[i%COLORS.length]}`}>
              <div className="size-2 rounded-full bg-current"/>
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard } from "@/components/app-shell";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/timetable")({ component: TimetablePage });

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7);
const COLORS = [
  "bg-blue-500/20 border-blue-500/40 text-blue-300",
  "bg-purple-500/20 border-purple-500/40 text-purple-300",
  "bg-green-500/20 border-green-500/40 text-green-300",
  "bg-orange-500/20 border-orange-500/40 text-orange-300",
  "bg-pink-500/20 border-pink-500/40 text-pink-300",
  "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
];

function AddSessionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const [form, setForm] = useState({
    course_id: "",
    session_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "10:00",
    is_recurring: false,
  });
  const [saving, setSaving] = useState(false);

  const { data: courses } = useQuery({
    queryKey: ["courses-for-session", branch],
    queryFn: async () =>
      (await supabase.from("courses").select("id,name").eq("branch_id", branch).eq("status", "active").order("name")).data ?? [],
  });

  async function save() {
    if (!form.course_id) { toast.error("Please select a course"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("sessions").insert({
        course_id: form.course_id,
        session_date: form.session_date,
        start_time: form.start_time,
        end_time: form.end_time || null,
        is_recurring: form.is_recurring,
      });
      if (error) throw error;
      toast.success("Session added");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="size-4"/></button>
        </div>

        {/* Course */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Course *</label>
          <select value={form.course_id} onChange={e => setForm({...form, course_id: e.target.value})}
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
            <option value="">— Select course —</option>
            {(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Date *</label>
          <input type="date" value={form.session_date} onChange={e => setForm({...form, session_date: e.target.value})}
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Start time</label>
            <input type="time" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">End time</label>
            <input type="time" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </div>
        </div>

        {/* Recurring */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({...form, is_recurring: e.target.checked})}
            className="size-4 accent-accent"/>
          Recurring weekly session
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {saving ? "Saving…" : "Add Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimetablePage() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [showAdd, setShowAdd] = useState(false);
  const weekEnd = addDays(weekStart, 6);
  const isAdmin = ["super_admin","finance_admin","dice_admin"].includes(user?.role ?? "");

  const { data: sessions } = useQuery({
    queryKey: ["timetable-sessions", format(weekStart,"yyyy-MM-dd"), user?.branch_id, activeBranch],
    queryFn: async () => {
      const from = format(weekStart,"yyyy-MM-dd");
      const to   = format(weekEnd,"yyyy-MM-dd");
      const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
      // Two-step: get branch courses first, then filter sessions
      const { data: brCourses } = await supabase.from("courses").select("id").eq("branch_id", branch);
      const brCourseIds = (brCourses??[]).map((c:any) => c.id);
      if (!brCourseIds.length) return [];
      const { data } = await supabase.from("sessions")
        .select("*,courses(name,branch_id)")
        .in("course_id", brCourseIds)
        .gte("session_date", from)
        .lte("session_date", to)
        .order("start_time");
      return (data ?? []).filter((s: any) => s.courses !== null);
    },
  });

  // Map sessions by day
  const sessionsByDay: Record<string, any[]> = {};
  DAYS.forEach(d => { sessionsByDay[d] = []; });
  (sessions??[]).forEach((s:any) => {
    const dayName = format(new Date(s.session_date + "T00:00:00"), "EEE");
    if (sessionsByDay[dayName]) sessionsByDay[dayName].push(s);
  });

  return (
    <div className="space-y-4">
      {showAdd && (
        <AddSessionModal
          onClose={() => setShowAdd(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["timetable-sessions"], exact: false })}
        />
      )}

      {/* Week nav + Add button */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart(w => subWeeks(w,1))} className="p-2 rounded-md hover:bg-muted border border-border">
          <ChevronLeft className="size-4"/>
        </button>
        <div className="text-center">
          <div className="font-semibold">{format(weekStart,"d MMM")} – {format(weekEnd,"d MMM yyyy")}</div>
          <div className="text-xs text-muted-foreground">Week {format(weekStart,"w")}</div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90">
              <Plus className="size-4"/> Add Session
            </button>
          )}
          <button onClick={() => setWeekStart(w => addWeeks(w,1))} className="p-2 rounded-md hover:bg-muted border border-border">
            <ChevronRight className="size-4"/>
          </button>
        </div>
      </div>

      {/* Mobile: Day cards */}
      <div className="sm:hidden space-y-3">
        {DAYS.map((day, di) => {
          const date = addDays(weekStart, di);
          const daySessions = sessionsByDay[day] ?? [];
          const isToday = format(date,"yyyy-MM-dd") === format(new Date(),"yyyy-MM-dd");
          return (
            <div key={day} className={`rounded-xl border p-3 ${isToday ? "border-accent/40 bg-accent/5" : "border-border bg-card"}`}>
              <div className={`text-sm font-semibold mb-2 ${isToday ? "text-accent" : ""}`}>
                {day} <span className="font-normal text-muted-foreground text-xs">{format(date,"d MMM")}</span>
              </div>
              {daySessions.length === 0
                ? <p className="text-xs text-muted-foreground">No sessions</p>
                : daySessions.map((s: any, i: number) => (
                  <div key={s.id} className={`rounded-lg border px-2 py-1.5 mb-1 text-xs ${COLORS[i % COLORS.length]}`}>
                    <div className="font-medium">{s.courses?.name}</div>
                    <div className="opacity-70">{s.start_time?.slice(0,5)}{s.end_time ? ` – ${s.end_time.slice(0,5)}` : ""}</div>
                  </div>
                ))
              }
            </div>
          );
        })}
      </div>

      {/* Desktop: Grid */}
      <div className="hidden sm:block overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Header row */}
          <div className="grid grid-cols-8 gap-px bg-border rounded-t-xl overflow-hidden">
            <div className="bg-card px-2 py-2 text-xs text-muted-foreground"></div>
            {DAYS.map((day, di) => {
              const date = addDays(weekStart, di);
              const isToday = format(date,"yyyy-MM-dd") === format(new Date(),"yyyy-MM-dd");
              return (
                <div key={day} className={`px-2 py-2 text-center ${isToday ? "bg-accent/10" : "bg-card"}`}>
                  <div className={`text-xs font-semibold ${isToday ? "text-accent" : ""}`}>{day}</div>
                  <div className={`text-xs ${isToday ? "text-accent" : "text-muted-foreground"}`}>{format(date,"d MMM")}</div>
                </div>
              );
            })}
          </div>
          {/* Time rows */}
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-8 gap-px bg-border">
              <div className="bg-card px-2 py-1 text-[10px] text-muted-foreground text-right">{hour}:00</div>
              {DAYS.map((day, di) => {
                const date = addDays(weekStart, di);
                const isToday = format(date,"yyyy-MM-dd") === format(new Date(),"yyyy-MM-dd");
                const slot = (sessionsByDay[day] ?? []).filter((s: any) => {
                  const h = parseInt(s.start_time?.slice(0,2) ?? "0");
                  return h === hour;
                });
                return (
                  <div key={day} className={`bg-card min-h-[40px] px-1 py-0.5 ${isToday ? "bg-accent/5" : ""}`}>
                    {slot.map((s: any, i: number) => (
                      <div key={s.id} className={`rounded px-1.5 py-1 text-[10px] border mb-0.5 ${COLORS[i % COLORS.length]}`}>
                        <div className="font-medium truncate">{s.courses?.name}</div>
                        <div className="opacity-70">{s.start_time?.slice(0,5)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

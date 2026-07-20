import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { CalendarCheck, CheckCircle2, XCircle, Clock, MinusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/attendance")({ component: AttendancePage });

const STATUS_CONFIG = {
  present:  { label:"Present",  icon:<CheckCircle2 className="size-4"/>, cls:"bg-success/15 text-success border-success/30",    btn:"bg-success/20 hover:bg-success/40 text-success border-success/40" },
  absent:   { label:"Absent",   icon:<XCircle className="size-4"/>,      cls:"bg-danger/15 text-danger border-danger/30",         btn:"bg-danger/20 hover:bg-danger/40 text-danger border-danger/40" },
  late:     { label:"Late",     icon:<Clock className="size-4"/>,         cls:"bg-warning/15 text-warning border-warning/30",     btn:"bg-warning/20 hover:bg-warning/40 text-warning border-warning/40" },
  excused:  { label:"Excused",  icon:<MinusCircle className="size-4"/>,   cls:"bg-muted text-muted-foreground border-border",     btn:"bg-muted/50 hover:bg-muted text-muted-foreground border-border" },
};

function AttendancePage() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const today = format(new Date(), "yyyy-MM-dd");

  // For teachers: only their sessions. For admin: all sessions
  const { data: sessions, isLoading } = useQuery({
    queryKey:["sessions-today", user?.id, user?.role, activeBranch],
    queryFn: async () => {
      const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";

      // Resolve allowed course IDs first — prevents cross-branch leakage via join filters
      let allowedCourseIds: string[] = [];
      if (user?.role === "student") {
        const { data: enr } = await supabase.from("course_enrollments").select("course_id").eq("student_id", user.linked_entity_id??user.id);
        allowedCourseIds = (enr??[]).map((e:any) => e.course_id);
      } else if (user?.role === "instructor" || user?.role === "teacher") {
        let cq = supabase.from("courses").select("id").eq("status","active");
        if (branch) cq = cq.eq("branch_id", branch);
        if (user.linked_entity_id) cq = cq.eq("instructor_id", user.linked_entity_id);
        const { data: myCourses } = await cq;
        allowedCourseIds = (myCourses??[]).map((c:any) => c.id);
      } else {
        // Admin/finance — all active courses in this branch
        const { data: branchCourses } = await supabase.from("courses").select("id").eq("branch_id", branch).eq("status","active");
        allowedCourseIds = (branchCourses??[]).map((c:any) => c.id);
      }

      if (!allowedCourseIds.length) return [];

      // Filter sessions directly by course_id — no ambiguous join filter
      const { data } = await supabase.from("sessions")
        .select("*,courses(name,instructor_id,per_session_billing,session_fee,branch_id)")
        .in("course_id", allowedCourseIds)
        .order("session_date", {ascending:false});
      return (data ?? []).filter((s:any) => s.courses !== null);
    },
  });

  const isAdmin = ["super_admin","finance_admin","dice_admin"].includes(user?.role ?? "");
  const isInstructor = user?.role === "instructor" || user?.role === "teacher";

  async function deleteSession(session: any, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${session.courses?.name}" session on ${session.session_date}?\nThis removes all attendance records for this session.`)) return;
    try {
      // Clear all FK references before deleting session
      await supabase.from("attendance_records").delete().eq("session_id", session.id);
      await supabase.from("attendance_charges").delete().eq("session_id", session.id);
      await supabase.from("lesson_plans").update({ session_id: null }).eq("session_id", session.id);
      const { error } = await supabase.from("sessions").delete().eq("id", session.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sessions-today"], exact: false });
      toast.success("Session deleted");
    } catch (e: any) {
      toast.error("Could not delete session: " + e.message);
    }
  }

  if (selectedSession) {
    return <AttendanceSheet session={selectedSession} onBack={() => setSelectedSession(null)} />;
  }

  const todaySessions  = (sessions??[]).filter((s:any) => s.session_date === today);
  const upcomingSessions = (sessions??[]).filter((s:any) => s.session_date > today).sort((a:any,b:any) => a.session_date.localeCompare(b.session_date));
  const pastSessions   = (sessions??[]).filter((s:any) => s.session_date < today).slice(0,15);

  return (
    <div className="space-y-4">
      {/* Today */}
      {todaySessions.length > 0 && (
        <PageCard title="Today's Sessions" subtitle={format(new Date(),"EEEE, d MMMM yyyy")}>
          <div className="space-y-2">
            {todaySessions.map((s:any) => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)} isAdmin={isAdmin} onDelete={(e) => deleteSession(s, e)} active/>)}
          </div>
        </PageCard>
      )}
      {/* Upcoming */}
      {upcomingSessions.length > 0 && (
        <PageCard title="Upcoming Sessions" subtitle="Scheduled — attendance opens on the day">
          <div className="space-y-2">
            {upcomingSessions.map((s:any) => (
              <SessionRow key={s.id} session={s} onClick={() => {}} isAdmin={isAdmin}
                onDelete={(e) => deleteSession(s, e)} upcoming/>
            ))}
          </div>
        </PageCard>
      )}
      {/* Past */}
      <PageCard title={todaySessions.length || upcomingSessions.length ? "Past Sessions" : "All Sessions"}>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="space-y-2">
          {pastSessions.map((s:any) => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)} isAdmin={isAdmin} onDelete={(e) => deleteSession(s, e)}/>)}
          {!isLoading && !sessions?.length && <p className="py-8 text-center text-muted-foreground">No sessions scheduled yet — add sessions from Timetable</p>}
        </div>
      </PageCard>
    </div>
  );
}

function SessionRow({ session, onClick, isAdmin, onDelete, active, upcoming }:{ session:any; onClick:()=>void; isAdmin?: boolean; onDelete?: (e: React.MouseEvent) => void; active?: boolean; upcoming?: boolean; }) {
  const cfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.present;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border hover:bg-muted/40 transition-colors">
      <button onClick={upcoming ? undefined : onClick} className={`flex-1 flex items-center justify-between gap-3 p-3 text-left ${upcoming ? "cursor-default opacity-70" : "cursor-pointer"}`}>
        <div className="flex items-center gap-3">
          <CalendarCheck className="size-5 text-accent shrink-0"/>
          <div>
            <div className="font-medium text-sm">{session.courses?.name ?? "Session"}</div>
            <div className="text-xs text-muted-foreground">{session.session_date} · {session.start_time?.slice(0,5)} – {session.end_time?.slice(0,5)}</div>
          </div>
        </div>
        <Badge className={cfg.cls}>{session.status}</Badge>
      </button>
      {isAdmin && onDelete && (
        <button onClick={onDelete} className="p-2 mr-2 rounded hover:bg-destructive/20 text-destructive shrink-0" title="Delete session">
          <Trash2 className="size-4"/>
        </button>
      )}
    </div>
  );
}

function AttendanceSheet({ session, onBack }:{ session:any; onBack:()=>void }) {
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);

  const { data: enrolled } = useQuery({
    queryKey:["enrolled", session.course_id],
    queryFn: async () => {
      const { data } = await supabase.from("course_enrollments")
        .select("student_id,students(id,first_name,last_name,admission_number,student_type)")
        .eq("course_id", session.course_id);
      return (data??[]).map((e:any) => e.students).filter(Boolean);
    },
  });

  const { data: existing } = useQuery({
    queryKey:["attendance-existing", session.id],
    queryFn: async () => {
      const { data } = await supabase.from("attendance_records").select("*").eq("session_id", session.id);
      const map:Record<string,string> = {};
      (data??[]).forEach((r:any) => { map[r.student_id] = r.status; });
      return map;
    }
  });

  function mark(studentId:string, status:string) {
    setMarks((m) => ({...m, [studentId]: status}));
  }

  async function saveAll() {
    setSaving(true);
    try {
      const rows = (enrolled??[]).map((s:any) => ({
        session_id: session.id, student_id: s.id,
        status: marks[s.id] ?? "absent", marked_by: null,
      }));

      // Upsert attendance records
      const { data: upserted, error } = await supabase.from("attendance_records")
        .upsert(rows, { onConflict:"session_id,student_id" }).select();
      if (error) throw error;

      // Auto-charge for present students on per-session-billing courses
      if (session.courses?.per_session_billing && session.courses?.session_fee) {
        const fee = Number(session.courses.session_fee);
        const presentRecords = (upserted??[]).filter((r:any) => r.status === "present");
        const billingTypes = ["junior","teen","adult"];

        for (const rec of presentRecords) {
          const student = (enrolled??[]).find((s:any) => s.id === rec.student_id);
          if (!student || !billingTypes.includes(student.student_type)) continue;

          // Check if charge already exists
          const { data: existing } = await supabase.from("attendance_charges")
            .select("id").eq("attendance_id", rec.id).limit(1);
          if (existing?.length) continue;

          // Create charge
          await supabase.from("attendance_charges").insert({
            attendance_id: rec.id, student_id: rec.student_id,
            course_id: session.course_id, session_id: session.id, amount: fee,
          });

          // Update student account
          await supabase.from("student_accounts").upsert({
            student_id: rec.student_id,
            total_fees: fee, total_outstanding: fee,
          }, { onConflict:"student_id" });
        }

        toast.success(`Attendance saved · ${presentRecords.length} session charges posted`);
      } else {
        toast.success("Attendance saved");
      }

      qc.invalidateQueries({queryKey:["attendance-existing", session.id]});
      onBack();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
        <div>
          <h2 className="font-semibold">{session.courses?.name}</h2>
          <p className="text-xs text-muted-foreground">{session.date} · {session.start_time?.slice(0,5)}</p>
        </div>
        {session.courses?.per_session_billing && (
          <Badge className="bg-accent/15 text-accent border-accent/30 ml-auto">
            KES {Number(session.courses.session_fee).toLocaleString()} / session
          </Badge>
        )}
      </div>

      <PageCard title={`Students (${enrolled?.length ?? 0})`}
        subtitle={session.courses?.per_session_billing ? "✓ Present = auto-charge" : undefined}>
        <div className="space-y-2">
          {(enrolled??[]).map((s:any) => {
            const current = (marks as Record<string,string>)[s.id] ?? existing?.[s.id] ?? "";
            const billable = ["junior","teen","adult"].includes(s.student_type);
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{s.first_name} {s.last_name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{s.admission_number}</span>
                    {session.courses?.per_session_billing && billable && (
                      <span className="text-xs text-accent">· charges on present</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {(Object.keys(STATUS_CONFIG) as (keyof typeof STATUS_CONFIG)[]).map((st) => (
                    <button key={st} onClick={() => mark(s.id, st)}
                      title={STATUS_CONFIG[st].label}
                      className={`size-8 rounded-md border flex items-center justify-center text-xs transition-all ${current === st ? STATUS_CONFIG[st].cls : "border-border text-muted-foreground hover:border-accent"}`}>
                      {st === "present" ? "P" : st === "absent" ? "A" : st === "late" ? "L" : "E"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!enrolled?.length && <p className="py-6 text-center text-muted-foreground">No students enrolled</p>}
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {Object.values(marks).filter(v=>v==="present").length} present ·{" "}
            {Object.values(marks).filter(v=>v==="absent").length} absent
          </div>
          <button onClick={saveAll} disabled={saving}
            className="px-5 py-2 rounded-md bg-accent text-accent-foreground font-medium text-sm disabled:opacity-50">
            {saving?"Saving…":"Save Attendance"}
          </button>
        </div>
      </PageCard>
    </div>
  );
}

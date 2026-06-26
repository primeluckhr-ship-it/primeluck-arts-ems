import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { CalendarCheck, CheckCircle2, XCircle, Clock, MinusCircle } from "lucide-react";
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
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const today = format(new Date(), "yyyy-MM-dd");

  // For teachers: only their sessions. For admin: all sessions
  const { data: sessions, isLoading } = useQuery({
    queryKey:["sessions-today", user?.id, user?.role],
    queryFn: async () => {
      let q = supabase.from("sessions")
        .select("*,courses(name,instructor_id,per_session_billing,session_fee,branch_id)")
        .order("start_time");
      // Instructors see all sessions for their branch so they can take attendance for any class
      if (user?.role === "teacher" || user?.role === "instructor") {
        q = q.eq("courses.branch_id", user?.branch_id ?? "");
      }
      if (user?.role === "dice_admin") {
        q = q.eq("courses.branch_id", user.branch_id);
      }
      if (user?.role === "student") {
        const { data: enr } = await supabase.from("course_enrollments").select("course_id").eq("student_id", user.linked_entity_id??user.id);
        const ids = (enr??[]).map((e:any) => e.course_id);
        if (ids.length) q = q.in("course_id", ids);
      }
      return (await q.order("session_date", {ascending:false})).data ?? [];
    },
  });

  if (selectedSession) {
    return <AttendanceSheet session={selectedSession} onBack={() => setSelectedSession(null)} />;
  }

  const todaySessions = (sessions??[]).filter((s:any) => s.session_date === today);
  const otherSessions = (sessions??[]).filter((s:any) => s.session_date !== today);

  return (
    <div className="space-y-4">
      {todaySessions.length > 0 && (
        <PageCard title="Today's Sessions" subtitle={format(new Date(),"EEEE, d MMMM yyyy")}>
          <div className="space-y-2">
            {todaySessions.map((s:any) => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)}/>)}
          </div>
        </PageCard>
      )}
      <PageCard title={todaySessions.length?"Recent Sessions":"All Sessions"}>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="space-y-2">
          {otherSessions.slice(0,20).map((s:any) => <SessionRow key={s.id} session={s} onClick={() => setSelectedSession(s)}/>)}
          {!isLoading && !sessions?.length && <p className="py-8 text-center text-muted-foreground">No sessions found</p>}
        </div>
      </PageCard>
    </div>
  );
}

function SessionRow({ session, onClick }:{ session:any; onClick:()=>void }) {
  const cfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.present;
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 text-left transition-colors">
      <div className="flex items-center gap-3">
        <CalendarCheck className="size-5 text-accent shrink-0"/>
        <div>
          <div className="font-medium text-sm">{session.courses?.name ?? "Session"}</div>
          <div className="text-xs text-muted-foreground">{session.session_date} · {session.start_time?.slice(0,5)} – {session.end_time?.slice(0,5)}</div>
        </div>
      </div>
      <Badge className={cfg.cls}>{session.status}</Badge>
    </button>
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
    },
    onSuccess: (data:any) => setMarks(data),
  });

  function mark(studentId:string, status:string) {
    setMarks((m) => ({...m, [studentId]: status}));
  }

  async function saveAll() {
    setSaving(true);
    try {
      const rows = (enrolled??[]).map((s:any) => ({
        session_id: session.id, student_id: s.id, course_id: session.course_id,
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
            const current = marks[s.id] ?? existing?.[s.id] ?? "";
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

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { getStatusColor } from "@/lib/pla";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format, formatISO } from "date-fns";

export const Route = createFileRoute("/_app/attendance")({
  validateSearch: (s: Record<string, unknown>) => ({ session: typeof s.session === "string" ? s.session : undefined }),
  component: AttendancePage,
});

type Mark = "present" | "absent" | "late" | "excused";

function AttendancePage() {
  const search = useSearch({ from: "/_app/attendance" });
  const { user } = useAuth();
  const [active, setActive] = useState<string | undefined>(search.session);
  useEffect(() => setActive(search.session), [search.session]);

  if (user?.role === "student") return <StudentAttendance />;
  if (active) return <SessionSheet sessionId={active} onBack={() => setActive(undefined)} />;
  return <SessionList onPick={setActive} />;
}

function SessionList({ onPick }: { onPick: (id: string) => void }) {
  const today = formatISO(new Date(), { representation: "date" });
  const { data } = useQuery({
    queryKey: ["sessions-list"],
    queryFn: async () => (await supabase
      .from("sessions")
      .select("id,session_date,topic,status,courses(name,room,start_time,end_time)")
      .order("session_date", { ascending: false }).limit(100)).data ?? [],
  });
  const todays = (data ?? []).filter((s: any) => s.session_date === today);
  const others = (data ?? []).filter((s: any) => s.session_date !== today);
  return (
    <div className="space-y-4">
      <PageCard title="Today's Sessions" subtitle={format(new Date(), "EEEE, dd MMM yyyy")}>
        <SessionTable rows={todays} onPick={onPick} />
      </PageCard>
      <PageCard title="Recent Sessions">
        <SessionTable rows={others} onPick={onPick} />
      </PageCard>
    </div>
  );
}

function SessionTable({ rows, onPick }: { rows: any[]; onPick: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Date</th><th>Course</th><th>Time</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-border/50">
              <td className="py-2.5">{format(new Date(s.session_date), "dd MMM")}</td>
              <td className="py-2.5">{s.courses?.name}</td>
              <td className="py-2.5 text-muted-foreground">{s.courses?.start_time?.slice(0,5)}–{s.courses?.end_time?.slice(0,5)}</td>
              <td className="py-2.5"><Badge className={getStatusColor(s.status)}>{s.status}</Badge></td>
              <td className="py-2.5"><button onClick={() => onPick(s.id)} className="text-accent text-xs font-medium inline-flex items-center gap-1"><ClipboardCheck className="size-4" /> Mark</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No sessions.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SessionSheet({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["session-sheet", sessionId],
    queryFn: async () => {
      const { data: session } = await supabase.from("sessions").select("*,courses(name,room)").eq("id", sessionId).maybeSingle();
      if (!session) return null;
      const { data: enr } = await supabase.from("course_enrollments").select("student_id,students(first_name,last_name,admission_number)").eq("course_id", session.course_id);
      const { data: existing } = await supabase.from("attendance_records").select("student_id,status").eq("session_id", sessionId);
      return { session, students: enr ?? [], existing: existing ?? [] };
    },
  });

  useEffect(() => {
    if (data?.existing) {
      const initial: Record<string, Mark> = {};
      data.existing.forEach((e: any) => { initial[e.student_id] = e.status; });
      setMarks(initial);
    }
  }, [data?.existing]);

  async function saveAll() {
    if (!data) return;
    setSaving(true);
    try {
      const records = data.students.map((s: any) => ({
        session_id: sessionId,
        student_id: s.student_id,
        status: marks[s.student_id] ?? "absent",
        marked_by: user?.id,
      }));
      // delete existing then insert
      await supabase.from("attendance_records").delete().eq("session_id", sessionId);
      const { error } = await supabase.from("attendance_records").insert(records);
      if (error) throw error;
      await supabase.from("sessions").update({ status: "completed" }).eq("id", sessionId);
      toast.success("Attendance saved");
      qc.invalidateQueries({ queryKey: ["sessions-list"] });
      onBack();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <div>Session not found.</div>;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to sessions</button>
      <PageCard
        title={`${data.session.courses?.name} — ${format(new Date(data.session.session_date), "dd MMM yyyy")}`}
        subtitle={data.session.topic || "No topic set"}
        action={<button onClick={saveAll} disabled={saving} className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save Attendance"}</button>}
      >
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Adm #</th><th>Student</th><th>Status</th></tr></thead>
          <tbody>
            {data.students.map((s: any) => (
              <tr key={s.student_id} className="border-b border-border/50">
                <td className="py-2.5 font-mono text-xs">{s.students?.admission_number}</td>
                <td className="py-2.5">{s.students?.first_name} {s.students?.last_name}</td>
                <td className="py-2.5">
                  <div className="flex gap-1">
                    {(["present","absent","late","excused"] as Mark[]).map((m) => (
                      <button key={m} onClick={() => setMarks({ ...marks, [s.student_id]: m })}
                        className={`px-3 py-1.5 text-xs rounded font-medium ${marks[s.student_id] === m ? markBg(m) : "bg-muted text-muted-foreground"}`}>
                        {m[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!data.students.length && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No enrolled students.</td></tr>}
          </tbody>
        </table>
      </PageCard>
    </div>
  );
}

function markBg(m: Mark) {
  return {
    present: "bg-success text-white",
    absent: "bg-danger text-white",
    late: "bg-warning text-white",
    excused: "bg-accent text-accent-foreground",
  }[m];
}

function StudentAttendance() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-attendance", user?.linked_entity_id],
    queryFn: async () => {
      if (!user?.linked_entity_id) return [];
      const { data } = await supabase
        .from("attendance_records")
        .select("status,sessions(session_date,courses(name))")
        .eq("student_id", user.linked_entity_id)
        .order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });
  return (
    <PageCard title="My Attendance" subtitle="Recent records">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Date</th><th>Course</th><th>Status</th></tr></thead>
        <tbody>
          {(data ?? []).map((a: any, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2.5">{a.sessions?.session_date ? format(new Date(a.sessions.session_date), "dd MMM yyyy") : "—"}</td>
              <td className="py-2.5">{a.sessions?.courses?.name}</td>
              <td className="py-2.5"><Badge className={getStatusColor(a.status)}>{a.status}</Badge></td>
            </tr>
          ))}
          {!data?.length && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No records.</td></tr>}
        </tbody>
      </table>
    </PageCard>
  );
}

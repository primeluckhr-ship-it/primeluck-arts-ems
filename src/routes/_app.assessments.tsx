import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/assessments")({
  component: AssessmentsPage,
});

function gradeFor(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "E";
}

function gradeColor(g: string) {
  return {
    A: "bg-success/20 text-success border-success/40",
    B: "bg-accent/20 text-accent border-accent/40",
    C: "bg-warning/20 text-warning border-warning/40",
    D: "bg-warning/20 text-warning border-warning/40",
    E: "bg-danger/20 text-danger border-danger/40",
  }[g] ?? "bg-muted text-muted-foreground border-border";
}

function AssessmentsPage() {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const scopedIds = useQuery({
    queryKey: ["assess-scope", user?.id],
    queryFn: async () => {
      if (user?.role === "student") return user.linked_entity_id ? [user.linked_entity_id] : [];
      if (user?.role === "parent" && user.linked_entity_id) {
        const { data } = await supabase.from("student_parents").select("student_id").eq("parent_id", user.linked_entity_id);
        return (data ?? []).map((r: any) => r.student_id);
      }
      return null;
    },
  });

  const { data } = useQuery({
    queryKey: ["assessments-list", scopedIds.data, branch],
    enabled: scopedIds.isSuccess,
    queryFn: async () => {
      let q = supabase.from("assessments").select("*,students(first_name,last_name,admission_number,branch_id),courses(name)").order("assessment_date", { ascending: false });
      if (scopedIds.data) {
        // parent/student: filter by their specific student IDs
        q = q.in("student_id", scopedIds.data.length ? scopedIds.data : ["__none__"]);
      } else {
        // admin/instructor: filter by branch
        if (branch) q = q.eq("branch_id", branch);
      }
      return (await q).data ?? [];
    },
  });

  const canCreate = ["super_admin","teacher","instructor","dice_admin"].includes(user?.role ?? "");

  return (
    <PageCard
      title="Assessments"
      subtitle={`${data?.length ?? 0} records`}
      action={canCreate && <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> New Assessment</button>}
    >
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Date</th><th>Student</th><th>Course</th><th>Title</th><th>Score</th><th>Grade</th></tr></thead>
        <tbody>
          {(data ?? []).map((a: any) => {
            const grade = a.grade || gradeFor(Number(a.score), Number(a.max_score) || 100);
            return (
              <tr key={a.id} className="border-b border-border/50">
                <td className="py-2.5">{a.assessment_date ? format(new Date(a.assessment_date), "dd MMM") : "—"}</td>
                <td className="py-2.5">{a.students?.first_name} {a.students?.last_name}</td>
                <td className="py-2.5">{a.courses?.name ?? "—"}</td>
                <td className="py-2.5 font-medium">{a.title}</td>
                <td className="py-2.5">{a.score}/{a.max_score}</td>
                <td className="py-2.5"><Badge className={gradeColor(grade)}>{grade}</Badge></td>
              </tr>
            );
          })}
          {!data?.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No assessments.</td></tr>}
        </tbody>
      </table>

      {open && <AssessForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["assessments-list"] }); }} />}
    </PageCard>
  );
}

function AssessForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const formBranch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const { data: students } = useQuery({ queryKey: ["assess-students", formBranch], queryFn: async () => {
      let q = supabase.from("students").select("id,first_name,last_name").eq("status","active");
      if (formBranch) q = q.eq("branch_id", formBranch);
      return (await q).data ?? [];
    } });
  const { data: courses } = useQuery({ queryKey: ["assess-courses", formBranch], queryFn: async () => {
      let q = supabase.from("courses").select("id,name").eq("status","active");
      if (formBranch) q = q.eq("branch_id", formBranch);
      return (await q).data ?? [];
    } });
  const [form, setForm] = useState({
    student_id: "", course_id: "", title: "", assessment_date: new Date().toISOString().slice(0, 10),
    score: 0, max_score: 100, notes: "",
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.student_id || !form.title) { toast.error("Required fields missing"); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...form, score: Number(form.score), max_score: Number(form.max_score),
        grade: gradeFor(Number(form.score), Number(form.max_score) || 100),
      };
      if (!payload.course_id) delete payload.course_id;
      await supabase.from("assessments").insert({...payload, branch_id: formBranch, instructor_id: user?.linked_entity_id || null}).throwOnError();
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">New Assessment</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Student" className="sm:col-span-2">
            <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option>{(students ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          </Field>
          <Field label="Course">
            <select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option>{(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Date"><Input type="date" value={form.assessment_date} onChange={(v) => setForm({ ...form, assessment_date: v })} /></Field>
          <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} /></Field>
          <Field label="Score"><Input type="number" value={String(form.score)} onChange={(v) => setForm({ ...form, score: Number(v) })} /></Field>
          <Field label="Max score"><Input type="number" value={String(form.max_score)} onChange={(v) => setForm({ ...form, max_score: Number(v) })} /></Field>
          <Field label="Notes / Feedback" className="sm:col-span-2">
            <textarea value={form.notes} rows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

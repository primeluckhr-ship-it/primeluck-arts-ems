import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Eye, Pencil, MessageCircle, Trash2 } from "lucide-react";
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

function buildWhatsappMessage(a: any): string {
  const isDice = a.branch_id === "dice-arts-nairobi";
  const schoolName = isDice ? "Dice Arts Academy" : "PrimeLuck Arts Academy";
  const grade = a.grade || gradeFor(Number(a.score), Number(a.max_score) || 100);
  const dateStr = a.assessment_date ? format(new Date(a.assessment_date), "dd MMM yyyy") : "—";
  const notesLine = a.notes ? `\n💬 *Notes*\n${a.notes}\n` : "";
  return `*${schoolName} — Assessment Result*\n\n👤 *Student:* ${a.students?.first_name} ${a.students?.last_name}\n📚 *Course:* ${a.courses?.name ?? "—"}\n📝 *Assessment:* ${a.title}\n📅 *Date:* ${dateStr}\n\n📊 *Score:* ${a.score}/${a.max_score}\n🏅 *Grade:* ${grade}\n${notesLine}\n_${schoolName}_`;
}

// Normalizes to Kenyan international format for wa.me links.
// wa.me requires the full country code with no leading 0 — a locally-typed
// number like "0712345678" or "0712 345 678" opens WhatsApp with no
// recognizable chat target, which just lands on the generic app/home screen.
function normalizeKenyanNumber(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("254")) return digits;         // already international, e.g. 254712345678
  if (digits.startsWith("0")) return "254" + digits.slice(1); // local format, e.g. 0712345678
  if (digits.length === 9) return "254" + digits;       // missing both 0 and 254, e.g. 712345678
  return digits; // anything else (e.g. a different country's full number) — leave as typed
}

function openWhatsApp(waNumber: string, a: any) {
  const digits = normalizeKenyanNumber(waNumber);
  if (!digits || digits.length < 10) { toast.error("Invalid WhatsApp number — check the digits and try again."); return; }
  const msg = buildWhatsappMessage(a);
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, "_blank");
}

function AssessmentsPage() {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [waPicker, setWaPicker] = useState<{ assessment: any; parents: any[] } | null>(null);
  const [manualEntry, setManualEntry] = useState<{ assessment: any; parentToUpdate: { parent_id: string; first_name: string } | null } | null>(null);

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
      return (await q.throwOnError()).data ?? [];
    },
  });

  const canManage = ["super_admin","teacher","instructor","dice_admin"].includes(user?.role ?? "");

  async function shareToWhatsApp(a: any) {
    try {
      const { data: links, error } = await supabase
        .from("student_parents")
        .select("parent_id,is_primary,parents(first_name,whatsapp,phone,relationship)")
        .eq("student_id", a.student_id);
      if (error) throw error;
      const contacts = (links ?? [])
        .map((l: any) => l.parents)
        .filter((p: any) => p?.whatsapp || p?.phone);
      if (contacts.length === 1) {
        openWhatsApp(contacts[0].whatsapp || contacts[0].phone, a);
        return;
      }
      if (contacts.length > 1) {
        setWaPicker({ assessment: a, parents: contacts });
        return;
      }
      // No number on file for any linked parent — let the user enter one on the spot
      const primaryLink = (links ?? []).find((l: any) => l.is_primary) ?? (links ?? [])[0];
      setManualEntry({
        assessment: a,
        parentToUpdate: primaryLink
          ? { parent_id: primaryLink.parent_id, first_name: (primaryLink.parents as any)?.first_name ?? "this parent" }
          : null,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function deleteAssessment(a: any) {
    if (!window.confirm("Delete this assessment? This cannot be undone.")) return;
    try {
      await supabase.from("assessments").delete().eq("id", a.id).throwOnError();
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["assessments-list"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <PageCard
      title="Assessments"
      subtitle={`${data?.length ?? 0} records`}
      action={canManage && <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> New Assessment</button>}
    >
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Date</th><th>Student</th><th>Course</th><th>Title</th><th>Score</th><th>Grade</th><th>Actions</th></tr></thead>
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
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewing(a)} title="View" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Eye className="size-4" /></button>
                    <button onClick={() => shareToWhatsApp(a)} title="Share via WhatsApp" className="p-1.5 rounded-md hover:bg-muted text-success"><MessageCircle className="size-4" /></button>
                    {canManage && <button onClick={() => setEditing(a)} title="Edit" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>}
                    {canManage && <button onClick={() => deleteAssessment(a)} title="Delete" className="p-1.5 rounded-md hover:bg-muted text-danger"><Trash2 className="size-4" /></button>}
                  </div>
                </td>
              </tr>
            );
          })}
          {!data?.length && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No assessments.</td></tr>}
        </tbody>
      </table>

      {open && <AssessForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["assessments-list"] }); }} />}
      {editing && (
        <AssessForm
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["assessments-list"] }); }}
        />
      )}
      {viewing && <AssessmentViewModal a={viewing} onClose={() => setViewing(null)} />}
      {waPicker && (
        <WhatsAppPickerModal
          parents={waPicker.parents}
          onPick={(p) => { openWhatsApp(p.whatsapp || p.phone, waPicker.assessment); setWaPicker(null); }}
          onClose={() => setWaPicker(null)}
        />
      )}
      {manualEntry && (
        <ManualWhatsAppModal
          assessment={manualEntry.assessment}
          parentToUpdate={manualEntry.parentToUpdate}
          onClose={() => setManualEntry(null)}
        />
      )}
    </PageCard>
  );
}

function AssessmentViewModal({ a, onClose }: { a: any; onClose: () => void }) {
  const grade = a.grade || gradeFor(Number(a.score), Number(a.max_score) || 100);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Assessment Details</h2>
          <Badge className={gradeColor(grade)}>{grade}</Badge>
        </div>
        <div className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Student:</span> {a.students?.first_name} {a.students?.last_name}{a.students?.admission_number ? ` (${a.students.admission_number})` : ""}</div>
          <div><span className="text-muted-foreground">Course:</span> {a.courses?.name ?? "—"}</div>
          <div><span className="text-muted-foreground">Title:</span> {a.title}</div>
          <div><span className="text-muted-foreground">Date:</span> {a.assessment_date ? format(new Date(a.assessment_date), "dd MMM yyyy") : "—"}</div>
          <div><span className="text-muted-foreground">Score:</span> {a.score}/{a.max_score}</div>
          {a.notes && (
            <div>
              <span className="text-muted-foreground block mb-1">Notes / Feedback:</span>
              <p className="whitespace-pre-wrap">{a.notes}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Close</button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppPickerModal({ parents, onPick, onClose }: { parents: any[]; onPick: (p: any) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Send to which parent?</h2>
        <div className="space-y-2">
          {parents.map((p: any, i: number) => (
            <button key={i} onClick={() => onPick(p)} className="w-full text-left px-3 py-2 rounded-md border border-border hover:bg-muted text-sm">
              <div className="font-medium">{p.first_name}</div>
              <div className="text-xs text-muted-foreground capitalize">{p.relationship ?? "Parent"}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ManualWhatsAppModal({ assessment, parentToUpdate, onClose }: {
  assessment: any;
  parentToUpdate: { parent_id: string; first_name: string } | null;
  onClose: () => void;
}) {
  const [number, setNumber] = useState("");
  const [saveIt, setSaveIt] = useState(!!parentToUpdate);
  const [sending, setSending] = useState(false);

  async function send() {
    const digits = number.replace(/\D/g, "");
    if (!digits) { toast.error("Enter a valid phone number"); return; }
    setSending(true);
    try {
      if (saveIt && parentToUpdate) {
        const { error } = await supabase.from("parents").update({ whatsapp: number.trim() }).eq("id", parentToUpdate.parent_id);
        if (error) {
          toast.error("Sent, but couldn't save the number: " + error.message);
        } else {
          toast.success(`Saved to ${parentToUpdate.first_name}'s contact for next time`);
        }
      }
      openWhatsApp(number, assessment);
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">No number on file</h2>
        <p className="text-xs text-muted-foreground mb-4">Enter a phone/WhatsApp number to send this assessment now.</p>
        <Field label="Phone / WhatsApp number">
          <Input type="tel" value={number} onChange={setNumber} placeholder="e.g. 0712 345 678" />
        </Field>
        {parentToUpdate && (
          <label className="flex items-center gap-2 text-sm mt-3 cursor-pointer">
            <input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} className="size-4 accent-accent" />
            Save this number to {parentToUpdate.first_name}'s contact for next time
          </label>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={send} disabled={sending} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Send</button>
        </div>
      </div>
    </div>
  );
}

function AssessForm({ existing, onClose, onSaved }: { existing?: any; onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const formBranch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const isEdit = !!existing;
  const { data: students } = useQuery({ queryKey: ["assess-students", formBranch], queryFn: async () => {
      let q = supabase.from("students").select("id,first_name,last_name").eq("status","active");
      if (formBranch) q = q.eq("branch_id", formBranch);
      return (await q.throwOnError()).data ?? [];
    } });
  const { data: courses } = useQuery({ queryKey: ["assess-courses", formBranch], queryFn: async () => {
      let q = supabase.from("courses").select("id,name").eq("status","active");
      if (formBranch) q = q.eq("branch_id", formBranch);
      return (await q.throwOnError()).data ?? [];
    } });
  const [form, setForm] = useState(() => existing ? {
    student_id: existing.student_id ?? "",
    course_id: existing.course_id ?? "",
    title: existing.title ?? "",
    assessment_date: existing.assessment_date ?? new Date().toISOString().slice(0, 10),
    score: String(existing.score ?? "0"),
    max_score: String(existing.max_score ?? "100"),
    notes: existing.notes ?? "",
  } : {
    student_id: "", course_id: "", title: "", assessment_date: new Date().toISOString().slice(0, 10),
    score: "0", max_score: "100", notes: "",
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
      if (isEdit) {
        await supabase.from("assessments").update(payload).eq("id", existing.id).throwOnError();
      } else {
        await supabase.from("assessments").insert({...payload, branch_id: formBranch, instructor_id: user?.linked_entity_id || null}).throwOnError();
      }
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{isEdit ? "Edit Assessment" : "New Assessment"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Student *" className="sm:col-span-2">
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
          <Field label="Title *" className="sm:col-span-2"><Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} /></Field>
          <Field label="Score"><Input type="number" value={form.score} onChange={(v) => setForm({ ...form, score: v })} /></Field>
          <Field label="Max score"><Input type="number" value={form.max_score} onChange={(v) => setForm({ ...form, max_score: v })} /></Field>
          <Field label="Notes / Feedback" className="sm:col-span-2">
            <textarea value={form.notes} rows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground mt-4">* Required</p>
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{isEdit ? "Save Changes" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

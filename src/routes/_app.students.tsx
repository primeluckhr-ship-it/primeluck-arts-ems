import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES, getStatusColor } from "@/lib/pla";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/students")({
  component: StudentsPage,
});

function StudentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["students-list"],
    queryFn: async () => {
      const [{ data: students }, { data: accounts }] = await Promise.all([
        supabase.from("students").select("*,programs(name)").order("created_at", { ascending: false }),
        supabase.from("student_accounts").select("student_id,total_outstanding"),
      ]);
      return (students ?? []).map((s: any) => ({
        ...s,
        outstanding: accounts?.find((a: any) => a.student_id === s.id)?.total_outstanding ?? 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data ?? []).filter((s: any) =>
      (statusFilter === "all" || s.status === statusFilter) &&
      (!q || `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(q))
    );
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-4">
      <PageCard
        title="Students"
        subtitle={`${data?.length ?? 0} total`}
        action={
          <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4" /> Add Student
          </button>
        }
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or admission #…"
              className="w-full bg-background border border-input rounded-md pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-2">Admission #</th><th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Level</th><th className="py-2 pr-2">Status</th><th className="py-2 text-right pr-2">Balance</th><th className="py-2 w-10"></th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 pr-2 font-mono text-xs"><Link to="/students/$id" params={{ id: s.id }} className="text-accent hover:underline">{s.admission_number}</Link></td>
                  <td className="py-2.5 pr-2 font-medium">{s.first_name} {s.last_name}</td>
                  <td className="py-2.5 pr-2 text-muted-foreground">{s.skill_level || "—"}</td>
                  <td className="py-2.5 pr-2"><Badge className={getStatusColor(s.status)}>{s.status}</Badge></td>
                  <td className="py-2.5 pr-2 text-right font-semibold">{formatKES(s.outstanding)}</td>
                  <td className="py-2.5">
                    <button onClick={() => { setEditing(s); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No students found</td></tr>}
            </tbody>
          </table>
        </div>
      </PageCard>

      {open && (
        <StudentForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["students-list"] }); }}
        />
      )}
    </div>
  );
}

function StudentForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    admission_number: initial?.admission_number ?? "",
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    date_of_birth: initial?.date_of_birth ?? "",
    gender: initial?.gender ?? "",
    school: initial?.school ?? "",
    grade: initial?.grade ?? "",
    skill_level: initial?.skill_level ?? "Beginner",
    enrollment_date: initial?.enrollment_date ?? new Date().toISOString().slice(0, 10),
    emergency_contact: initial?.emergency_contact ?? "",
    notes: initial?.notes ?? "",
    status: initial?.status ?? "active",
  });
  const [saving, setSaving] = useState(false);

  async function suggest() {
    const { data } = await supabase.from("students").select("admission_number").order("admission_number", { ascending: false }).limit(1);
    const last = data?.[0]?.admission_number ?? "PLA0000";
    const n = parseInt(last.replace(/\D/g, "")) || 0;
    setForm((f) => ({ ...f, admission_number: `PLA${String(n + 1).padStart(4, "0")}` }));
  }

  async function save() {
    setSaving(true);
    try {
      if (initial) {
        const { error } = await supabase.from("students").update(form).eq("id", initial.id);
        if (error) throw error;
        toast.success("Student updated");
      } else {
        const { error } = await supabase.from("students").insert(form);
        if (error) throw error;
        toast.success("Student added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Student" : "Add Student"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Admission #">
            <div className="flex gap-2">
              <input value={form.admission_number} onChange={(e) => setForm({ ...form, admission_number: e.target.value })} className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm" />
              {!initial && <button type="button" onClick={suggest} className="text-xs bg-muted px-2 rounded">Auto</button>}
            </div>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>active</option><option>inactive</option><option>suspended</option>
            </select>
          </Field>
          <Field label="First name"><Input value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} /></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} /></Field>
          <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(v) => setForm({ ...form, date_of_birth: v })} /></Field>
          <Field label="Gender">
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option><option>male</option><option>female</option><option>other</option>
            </select>
          </Field>
          <Field label="School"><Input value={form.school} onChange={(v) => setForm({ ...form, school: v })} /></Field>
          <Field label="Grade"><Input value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} /></Field>
          <Field label="Skill level">
            <select value={form.skill_level} onChange={(e) => setForm({ ...form, skill_level: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
            </select>
          </Field>
          <Field label="Enrollment date"><Input type="date" value={form.enrollment_date} onChange={(v) => setForm({ ...form, enrollment_date: v })} /></Field>
          <Field label="Emergency contact" className="sm:col-span-2"><Input value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} /></Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="text-xs font-medium text-muted-foreground block mb-1">{label}</span>{children}</label>;
}

export function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />;
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/programs")({
  component: ProgramsPage,
});

function ProgramsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["programs-list"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  return (
    <PageCard
      title="Programs"
      subtitle={`${data?.length ?? 0} programs`}
      action={<button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Add</button>}
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data ?? []).map((p: any) => (
          <div key={p.id} className="border border-border rounded-lg p-4 bg-background/30">
            <div className="flex items-start justify-between mb-2">
              <div className="font-semibold">{p.name}</div>
              <button onClick={() => { setEditing(p); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button>
            </div>
            {p.description && <div className="text-xs text-muted-foreground mb-3">{p.description}</div>}
            <div className="text-lg font-bold text-accent">{formatKES(p.monthly_fee)}/mo</div>
            <div className="text-xs text-muted-foreground mt-1">{p.duration_months} months · {p.sessions_per_week}/wk · {p.skill_level}</div>
          </div>
        ))}
        {!data?.length && <div className="md:col-span-3 text-center py-8 text-muted-foreground">No programs.</div>}
      </div>

      {open && <ProgramForm initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["programs-list"] }); }} />}
    </PageCard>
  );
}

function ProgramForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    skill_level: initial?.skill_level ?? "Beginner",
    duration_months: initial?.duration_months ?? 3,
    sessions_per_week: initial?.sessions_per_week ?? 2,
    monthly_fee: initial?.monthly_fee ?? 0,
    registration_fee: initial?.registration_fee ?? 0,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_months: Number(form.duration_months),
        sessions_per_week: Number(form.sessions_per_week),
        monthly_fee: Number(form.monthly_fee),
        registration_fee: Number(form.registration_fee),
      };
      if (initial) await supabase.from("programs").update(payload).eq("id", initial.id).throwOnError();
      else await supabase.from("programs").insert(payload).throwOnError();
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Add"} Program</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} /></Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea value={form.description} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Level">
            <select value={form.skill_level} onChange={(e) => setForm({ ...form, skill_level: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
            </select>
          </Field>
          <Field label="Duration (months)"><Input type="number" value={String(form.duration_months)} onChange={(v) => setForm({ ...form, duration_months: Number(v) })} /></Field>
          <Field label="Sessions / week"><Input type="number" value={String(form.sessions_per_week)} onChange={(v) => setForm({ ...form, sessions_per_week: Number(v) })} /></Field>
          <Field label="Monthly fee (KES)"><Input type="number" value={String(form.monthly_fee)} onChange={(v) => setForm({ ...form, monthly_fee: Number(v) })} /></Field>
          <Field label="Registration fee (KES)"><Input type="number" value={String(form.registration_fee)} onChange={(v) => setForm({ ...form, registration_fee: Number(v) })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

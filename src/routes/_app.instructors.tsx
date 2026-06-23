import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/instructors")({
  component: InstructorsPage,
});

function InstructorsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["instructors-list"],
    queryFn: async () => (await supabase.from("instructors").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <PageCard
      title="Instructors"
      subtitle={`${data?.length ?? 0} total`}
      action={<button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Add</button>}
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data ?? []).map((i: any) => (
          <div key={i.id} className="border border-border rounded-lg p-4 bg-background/30">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{i.first_name} {i.last_name}</div>
                <div className="text-xs text-muted-foreground">{i.email}</div>
              </div>
              <button onClick={() => { setEditing(i); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button>
            </div>
            <div className="text-xs text-muted-foreground mt-2">{i.phone}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(i.specialization ?? []).map((s: string, idx: number) => <Badge key={idx} className="bg-accent/15 text-accent border-accent/30">{s}</Badge>)}
            </div>
          </div>
        ))}
        {!data?.length && <div className="md:col-span-3 text-center py-8 text-muted-foreground">No instructors.</div>}
      </div>

      {open && (
        <InstructorForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["instructors-list"] }); }}
        />
      )}
    </PageCard>
  );
}

function InstructorForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    specialization: (initial?.specialization ?? []).join(", "),
    bio: initial?.bio ?? "",
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const payload = { ...form, specialization: form.specialization.split(",").map((s: string) => s.trim()).filter(Boolean) };
      if (initial) await supabase.from("instructors").update(payload).eq("id", initial.id).throwOnError();
      else await supabase.from("instructors").insert(payload).throwOnError();
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Add"} Instructor</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} /></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} /></Field>
          <Field label="Email"><Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
          <Field label="Specialization (comma-separated)" className="sm:col-span-2"><Input value={form.specialization} onChange={(v) => setForm({ ...form, specialization: v })} /></Field>
          <Field label="Bio" className="sm:col-span-2">
            <textarea value={form.bio} rows={3} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
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

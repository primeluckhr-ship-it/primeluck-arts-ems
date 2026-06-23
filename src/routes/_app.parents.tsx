import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/parents")({
  component: ParentsPage,
});

function ParentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["parents-list"],
    queryFn: async () => (await supabase.from("parents").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data ?? []).filter((p: any) => !q || `${p.first_name} ${p.last_name} ${p.email} ${p.phone}`.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <PageCard
      title="Parents"
      subtitle={`${data?.length ?? 0} total`}
      action={<button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Add Parent</button>}
    >
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full bg-background border border-input rounded-md pl-9 pr-3 py-2 text-sm" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Name</th><th>Phone</th><th>WhatsApp</th><th>Email</th><th className="w-10"></th></tr></thead>
          <tbody>
            {filtered.map((p: any) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-2.5 font-medium">{p.first_name} {p.last_name}</td>
                <td className="py-2.5 text-muted-foreground">{p.phone}</td>
                <td className="py-2.5 text-muted-foreground">{p.whatsapp || "—"}</td>
                <td className="py-2.5 text-muted-foreground">{p.email}</td>
                <td><button onClick={() => { setEditing(p); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No parents.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <ParentForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["parents-list"] }); }}
        />
      )}
    </PageCard>
  );
}

function ParentForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    whatsapp: initial?.whatsapp ?? "",
    occupation: initial?.occupation ?? "",
    relationship: initial?.relationship ?? "Parent",
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      if (initial) await supabase.from("parents").update(form).eq("id", initial.id).throwOnError();
      else await supabase.from("parents").insert(form).throwOnError();
      toast.success("Saved");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Add"} Parent</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} /></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} /></Field>
          <Field label="Email"><Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} /></Field>
          <Field label="Relationship"><Input value={form.relationship} onChange={(v) => setForm({ ...form, relationship: v })} /></Field>
          <Field label="Occupation" className="sm:col-span-2"><Input value={form.occupation} onChange={(v) => setForm({ ...form, occupation: v })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

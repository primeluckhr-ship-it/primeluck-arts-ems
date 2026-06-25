import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/programs")({ component: ProgramsPage });

function ProgramsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["programs-list"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  return (
    <div className="space-y-4">
      <PageCard
        title="Programs"
        subtitle="Art programs offered at the academy"
        action={
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4" /> Add Program
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Billing</th>
              <th className="py-2 pr-3 text-right">Monthly Fee</th>
              <th className="py-2 pr-3 text-right">Term Fee</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 w-10"></th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {(data ?? []).map((p: any) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 pr-3 font-medium">{p.name}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{p.category || "—"}</td>
                  <td className="py-2.5 pr-3">
                    <Badge className={p.billing_cycle === "termly"
                      ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                      : "bg-blue-500/15 text-blue-400 border-blue-500/30"}>
                      {p.billing_cycle ?? "monthly"}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-right">{p.monthly_fee ? formatKES(p.monthly_fee) : "—"}</td>
                  <td className="py-2.5 pr-3 text-right">{p.term_fee ? formatKES(p.term_fee) : "—"}</td>
                  <td className="py-2.5 pr-3">
                    <Badge className={p.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}>
                      {p.status ?? "active"}
                    </Badge>
                  </td>
                  <td className="py-2.5">
                    <button onClick={() => { setEditing(p); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No programs yet</td></tr>}
            </tbody>
          </table>
        </div>
      </PageCard>

      {open && (
        <ProgramForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["programs-list"] }); }}
        />
      )}
    </div>
  );
}

function ProgramForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "general",
    description: initial?.description ?? "",
    billing_cycle: initial?.billing_cycle ?? "monthly",
    monthly_fee: initial?.monthly_fee ?? "",
    term_fee: initial?.term_fee ?? "",
    max_students: initial?.max_students ?? "",
    status: initial?.status ?? "active",
    category: initial?.category ?? "general",
  });
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        monthly_fee: form.billing_cycle === "monthly" ? (Number(form.monthly_fee) || null) : null,
        term_fee: form.billing_cycle === "termly" ? (Number(form.term_fee) || null) : null,
        max_students: Number(form.max_students) || null,
        branch_id: user?.branch_id ?? "",
      };
      if (initial) {
        const { error } = await supabase.from("programs").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Program updated");
      } else {
        const { error } = await supabase.from("programs").insert(payload);
        if (error) throw error;
        toast.success("Program created");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Program" : "New Program"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Program name" className="sm:col-span-2"><Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="general">General</option>
              <option value="painting">Painting</option>
              <option value="drawing">Drawing</option>
              <option value="sculpture">Sculpture</option>
              <option value="digital_art">Digital Art</option>
              <option value="craft">Craft</option>
              <option value="photography">Photography</option>
              <option value="mixed_media">Mixed Media</option>
            </select>
          </Field>
          <Field label="Max students"><Input type="number" value={form.max_students} onChange={(v) => setForm({ ...form, max_students: v })} /></Field>

          <Field label="Billing cycle" className="sm:col-span-2">
            <div className="flex gap-2">
              {["monthly", "termly"].map((cycle) => (
                <button key={cycle} type="button"
                  onClick={() => setForm({ ...form, billing_cycle: cycle })}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border transition-all capitalize ${form.billing_cycle === cycle ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground hover:border-accent"}`}>
                  {cycle}
                </button>
              ))}
            </div>
          </Field>

          {form.billing_cycle === "monthly" && (
            <Field label="Monthly fee (KES)" className="sm:col-span-2">
              <Input type="number" value={form.monthly_fee} onChange={(v) => setForm({ ...form, monthly_fee: v })} placeholder="e.g. 4500" />
            </Field>
          )}
          {form.billing_cycle === "termly" && (
            <Field label="Term fee (KES)" className="sm:col-span-2">
              <Input type="number" value={form.term_fee} onChange={(v) => setForm({ ...form, term_fee: v })} placeholder="e.g. 12000" />
            </Field>
          )}

          <Field label="Description" className="sm:col-span-2">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <div className="flex gap-2">
              {(["active","inactive"] as const).map((v) => (
                <button key={String(v)} type="button" onClick={() => setForm({ ...form, status: String(v) })}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border transition-all ${form.status === String(v) ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground"}`}>
                  {v === "active" ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

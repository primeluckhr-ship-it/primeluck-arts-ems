import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, Pencil, Building2, Wallet, Users } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/dice-institutions")({ component: DiceInstitutionsPage });

function DiceInstitutionsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dice-institutions-full"],
    queryFn: async () => {
      const { data } = await supabase.from("dice_institutions")
        .select("*").eq("branch_id","dice-arts-nairobi").order("name");
      return data ?? [];
    },
  });

  const totalFees = (data ?? []).reduce((s: number, i: any) => s + Number(i.term_fee ?? 0), 0);
  const totalComm = (data ?? []).reduce((s: number, i: any) => s + Number(i.term_fee ?? 0) * Number(i.commission_rate ?? 0) / 100, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Partner Schools" value={(data ?? []).length} icon={<Building2 className="size-5"/>} tone="default"/>
        <StatCard label="Term Revenue" value={formatKES(totalFees)} icon={<Wallet className="size-5"/>} tone="success"/>
        <StatCard label="PLA Commission" value={formatKES(totalComm)} icon={<Wallet className="size-5"/>} tone="gold"/>
      </div>

      <PageCard title="Partner Institutions"
        subtitle="Schools and organisations served by Dice Arts"
        action={
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4"/>Add School
          </button>
        }>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="grid sm:grid-cols-2 gap-4">
          {(data ?? []).map((inst: any) => (
            <div key={inst.id} className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-accent/15 flex items-center justify-center text-accent font-bold">
                    {inst.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold">{inst.name}</div>
                    <div className="text-xs text-muted-foreground">{inst.contact_person}</div>
                  </div>
                </div>
                <button onClick={() => { setEditing(inst); setOpen(true); }} className="p-1.5 rounded hover:bg-muted">
                  <Pencil className="size-4"/>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {inst.phone && <div className="text-muted-foreground">{inst.phone}</div>}
                {inst.email && <div className="text-muted-foreground truncate">{inst.email}</div>}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Term Fee</div>
                  <div className="font-bold text-sm text-success">{formatKES(inst.term_fee ?? 0)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Commission</div>
                  <div className="font-bold text-sm text-accent">{inst.commission_rate ?? 0}%</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">PLA Gets</div>
                  <div className="font-bold text-sm text-accent">{formatKES((inst.term_fee ?? 0) * (inst.commission_rate ?? 0) / 100)}</div>
                </div>
              </div>
              {inst.notes && <p className="text-xs text-muted-foreground">{inst.notes}</p>}
            </div>
          ))}
          {!isLoading && !data?.length && (
            <p className="col-span-2 py-8 text-center text-muted-foreground">No partner schools yet — add your first institution</p>
          )}
        </div>
      </PageCard>

      {open && (
        <InstForm initial={editing} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["dice-institutions-full"] }); }}/>
      )}
    </div>
  );
}

function InstForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    contact_person: initial?.contact_person ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    term_fee: initial?.term_fee ?? "",
    commission_rate: initial?.commission_rate ?? 15,
    notes: initial?.notes ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const previewComm = (Number(form.term_fee) || 0) * (Number(form.commission_rate) || 0) / 100;

  async function save() {
    if (!form.name) { toast.error("Institution name required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, branch_id: "dice-arts-nairobi",
        term_fee: Number(form.term_fee) || null, commission_rate: Number(form.commission_rate) || 0 };
      if (initial) {
        const { error } = await supabase.from("dice_institutions").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await supabase.from("dice_institutions").insert(payload);
        if (error) throw error;
        toast.success("Institution added");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Institution" : "New Partner School"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="School / Institution name" className="sm:col-span-2"><Input value={form.name} onChange={(v) => setForm({...form,name:v})}/></Field>
          <Field label="Contact person"><Input value={form.contact_person} onChange={(v) => setForm({...form,contact_person:v})}/></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(v) => setForm({...form,phone:v})}/></Field>
          <Field label="Email" className="sm:col-span-2"><Input value={form.email} onChange={(v) => setForm({...form,email:v})}/></Field>
          <Field label="Term fee (KES)"><Input type="number" value={form.term_fee} onChange={(v) => setForm({...form,term_fee:v})} placeholder="e.g. 45000"/></Field>
          <Field label="PLA Commission %"><Input type="number" value={String(form.commission_rate)} onChange={(v) => setForm({...form,commission_rate:Number(v)})}/></Field>
          {previewComm > 0 && (
            <div className="sm:col-span-2 rounded-md bg-accent/10 border border-accent/20 px-3 py-2 text-sm text-center">
              PLA earns <span className="font-bold text-accent">{formatKES(previewComm)}</span> per term from this school
            </div>
          )}
          <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(v) => setForm({...form,address:v})}/></Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm({...form,notes:e.target.value})}
              rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

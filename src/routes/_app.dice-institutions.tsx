import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, Pencil, Building2, Wallet, Users, Trash2, CreditCard, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/dice-institutions")({ component: PartnerSchoolsPage });

function PartnerSchoolsPage() {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? (activeBranch ?? user?.branch_id) : user?.branch_id;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payInst, setPayInst] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const qc = useQueryClient();

  // Load institutions with student counts + payments
  const { data: institutions, isLoading } = useQuery({
    queryKey: ["partner-schools", branch],
    queryFn: async () => {
      const { data: insts } = await supabase
        .from("institutions")
        .select("*,courses(name)")
        .eq("branch_id", branch ?? "")
        .eq("is_active", true)
        .order("name");

      if (!insts?.length) return [];

      // For each institution: count active students + sum payments
      const enriched = await Promise.all((insts ?? []).map(async (inst: any) => {
        const [{ count: studentCount }, { data: students }, { data: payments }] = await Promise.all([
          supabase.from("students")
            .select("id", { count: "exact", head: true })
            .eq("institution_id", inst.id)
            .eq("status", "active"),
          supabase.from("students")
            .select("id,first_name,last_name,status,admission_number")
            .eq("institution_id", inst.id)
            .order("first_name"),
          supabase.from("institution_payments")
            .select("amount,payment_date,term_label,payment_method,reference")
            .eq("institution_id", inst.id)
            .order("payment_date", { ascending: false }),
        ]);

        const activeCount = studentCount ?? 0;
        const termTotal   = activeCount * Number(inst.termly_fee ?? 0);
        const totalPaid   = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
        const outstanding = termTotal - totalPaid;

        return { ...inst, activeCount, students: students ?? [], payments: payments ?? [], termTotal, totalPaid, outstanding };
      }));

      return enriched;
    },
  });

  const totalStudents   = (institutions ?? []).reduce((s: number, i: any) => s + i.activeCount, 0);
  const totalExpected   = (institutions ?? []).reduce((s: number, i: any) => s + i.termTotal, 0);
  const totalOutstanding = (institutions ?? []).reduce((s: number, i: any) => s + i.outstanding, 0);

  async function deleteInstitution(inst: any) {
    if (!confirm(`Delete "${inst.name}"? Students linked to this institution will lose the link but remain in the system.`)) return;
    await supabase.from("institutions").update({ is_active: false }).eq("id", inst.id);
    qc.invalidateQueries({ queryKey: ["partner-schools"] });
    toast.success(`${inst.name} removed`);
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Partner Schools"    value={(institutions ?? []).length}   icon={<Building2 className="size-5"/>} tone="default"/>
        <StatCard label="Students Enrolled"  value={totalStudents}                  icon={<Users className="size-5"/>}    tone="default"/>
        <StatCard label="Term Revenue Due"   value={formatKES(totalExpected)}       icon={<Wallet className="size-5"/>}   tone="success"/>
        <StatCard label="Outstanding"        value={formatKES(totalOutstanding)}    icon={<Wallet className="size-5"/>}   tone={totalOutstanding > 0 ? "danger" : "success"}/>
      </div>

      <PageCard
        title="Partner Schools"
        subtitle="Per-student termly billing"
        action={
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4"/>Add School
          </button>
        }
      >
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="space-y-4">
          {(institutions ?? []).map((inst: any) => (
            <div key={inst.id} className="rounded-xl border border-border bg-background overflow-hidden">
              {/* Header */}
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-accent/15 flex items-center justify-center text-accent font-bold text-lg shrink-0">
                    {inst.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold">{inst.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                      {inst.courses?.name
                        ? <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">{inst.courses.name}</span>
                        : <span className="text-warning italic">No course linked</span>}
                      {inst.contact_person && <span>· {inst.contact_person}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setPayInst(inst); setPayOpen(true); }}
                    className="p-1.5 rounded hover:bg-success/20 text-success" title="Record payment">
                    <CreditCard className="size-4"/>
                  </button>
                  <button onClick={() => { setEditing(inst); setOpen(true); }}
                    className="p-1.5 rounded hover:bg-muted" title="Edit">
                    <Pencil className="size-4"/>
                  </button>
                  <button onClick={() => deleteInstitution(inst)}
                    className="p-1.5 rounded hover:bg-destructive/20 text-destructive" title="Remove">
                    <Trash2 className="size-4"/>
                  </button>
                </div>
              </div>

              {/* Billing row */}
              <div className="grid grid-cols-4 divide-x divide-border border-t border-border text-center">
                <div className="p-3">
                  <div className="text-xs text-muted-foreground">Students</div>
                  <div className="text-xl font-bold text-accent">{inst.activeCount}</div>
                </div>
                <div className="p-3">
                  <div className="text-xs text-muted-foreground">Fee / Student</div>
                  <div className="font-bold text-sm">{formatKES(inst.termly_fee ?? 0)}</div>
                </div>
                <div className="p-3">
                  <div className="text-xs text-muted-foreground">Term Total</div>
                  <div className="font-bold text-sm text-success">{formatKES(inst.termTotal)}</div>
                </div>
                <div className="p-3">
                  <div className="text-xs text-muted-foreground">Outstanding</div>
                  <div className={`font-bold text-sm ${inst.outstanding > 0 ? "text-destructive" : "text-success"}`}>
                    {formatKES(inst.outstanding)}
                  </div>
                </div>
              </div>

              {/* Expandable: students + payment history */}
              <button onClick={() => setExpanded(expanded === inst.id ? null : inst.id)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 border-t border-border">
                <span>View students & payments ({inst.students.length} students · {inst.payments.length} payments)</span>
                {expanded === inst.id ? <ChevronUp className="size-3.5"/> : <ChevronDown className="size-3.5"/>}
              </button>

              {expanded === inst.id && (
                <div className="border-t border-border grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                  {/* Students */}
                  <div className="p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Enrolled Students</p>
                    {inst.students.length === 0
                      ? <p className="text-xs text-muted-foreground italic">No students yet</p>
                      : <div className="space-y-1">
                          {(inst.students??[]).map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium">{s.first_name} {s.last_name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-mono">{s.admission_number}</span>
                                <Badge className={s.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}>
                                  {s.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                  {/* Payment history */}
                  <div className="p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Payment History</p>
                    {inst.payments.length === 0
                      ? <p className="text-xs text-muted-foreground italic">No payments recorded</p>
                      : <div className="space-y-1">
                          {(inst.payments??[]).map((p: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium text-success">{formatKES(p.amount)}</span>
                                <span className="text-muted-foreground ml-2">{p.term_label}</span>
                              </div>
                              <span className="text-muted-foreground">{p.payment_date}</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-border flex justify-between text-xs font-semibold">
                            <span>Total Paid</span>
                            <span className="text-success">{formatKES(inst.totalPaid)}</span>
                          </div>
                        </div>
                    }
                  </div>
                </div>
              )}
            </div>
          ))}
          {!isLoading && !institutions?.length && (
            <p className="py-8 text-center text-muted-foreground">No partner schools yet — add your first institution</p>
          )}
        </div>
      </PageCard>

      {open && (
        <InstForm initial={editing} branch={branch ?? ""} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["partner-schools"] }); }}/>
      )}
      {payOpen && payInst && (
        <PaymentForm inst={payInst} onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); qc.invalidateQueries({ queryKey: ["partner-schools"] }); }}/>
      )}
    </div>
  );
}

/* ── Institution Form ── */
function InstForm({ initial, branch, onClose, onSaved }: { initial: any; branch: string; onClose: () => void; onSaved: () => void }) {
  const { data: courses } = useQuery({
    queryKey: ["courses-active", branch],
    queryFn: async () => (await supabase.from("courses").select("id,name").eq("status","active").eq("branch_id", branch).order("name").throwOnError()).data ?? [],
  });

  const [form, setForm] = useState({
    name:           initial?.name           ?? "",
    contact_person: initial?.contact_person ?? "",
    contact_phone:  initial?.contact_phone  ?? "",
    billing_email:  initial?.billing_email  ?? "",
    address:        initial?.address        ?? "",
    course_id:      initial?.course_id      ?? "",
    termly_fee:     initial?.termly_fee     ?? "",
    notes:          initial?.notes          ?? "",
    is_active:      initial?.is_active      ?? true,
  });
  const [saving, setSaving] = useState(false);

  const studentCount = initial?.activeCount ?? 0;
  const termTotal    = studentCount * (Number(form.termly_fee) || 0);

  async function save() {
    if (!form.name) { toast.error("School name required"); return; }
    if (!form.termly_fee || Number(form.termly_fee) <= 0) { toast.error("Set a termly fee per student"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        branch_id:  branch,
        termly_fee: Number(form.termly_fee) || 0,
        course_id:  form.course_id || null,
        is_active:  true,
      };
      if (initial) {
        const { error } = await supabase.from("institutions").update(payload).eq("id", initial.id);
        if (error) throw error;
        // If course changed, re-enrol all students of this institution
        if (form.course_id && form.course_id !== initial.course_id) {
          const { data: studs } = await supabase.from("students").select("id").eq("institution_id", initial.id).eq("status","active");
          for (const s of (studs ?? [])) {
            await supabase.from("course_enrollments").upsert({
              student_id: s.id, course_id: form.course_id,
              status: "active", enrollment_date: new Date().toISOString().slice(0,10),
            }, { onConflict: "student_id,course_id" });
          }
          toast.success(`All students re-enrolled in ${courses?.find(c => c.id === form.course_id)?.name}`);
        }
        toast.success("Institution updated");
      } else {
        const { error } = await supabase.from("institutions").insert(payload);
        if (error) throw error;
        toast.success("Partner school added");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Partner School" : "Add Partner School"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="School name" className="sm:col-span-2"><Input value={form.name} onChange={(v) => setForm({...form,name:v})}/></Field>

          {/* Billing setup */}
          <div className="sm:col-span-2 rounded-xl bg-accent/5 border border-accent/20 p-3 space-y-3">
            <p className="text-xs font-semibold text-accent uppercase tracking-wide">Billing Setup</p>
            <Field label="Linked Course (all students auto-enrol here)">
              <select value={form.course_id} onChange={(e) => setForm({...form,course_id:e.target.value})}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option value="">— Select course —</option>
                {(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Termly Fee per Student (KES)">
              <Input type="number" value={String(form.termly_fee)} onChange={(v) => setForm({...form,termly_fee:v})} placeholder="e.g. 7000"/>
            </Field>
            {studentCount > 0 && Number(form.termly_fee) > 0 && (
              <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-sm text-center">
                <span className="text-muted-foreground">{studentCount} students × {formatKES(Number(form.termly_fee))} = </span>
                <span className="font-bold text-success">{formatKES(termTotal)} per term</span>
              </div>
            )}
          </div>

          <Field label="Contact person"><Input value={form.contact_person} onChange={(v) => setForm({...form,contact_person:v})}/></Field>
          <Field label="Phone"><Input value={form.contact_phone} onChange={(v) => setForm({...form,contact_phone:v})}/></Field>
          <Field label="Billing email" className="sm:col-span-2"><Input value={form.billing_email} onChange={(v) => setForm({...form,billing_email:v})}/></Field>
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
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Record Institution Payment ── */
function PaymentForm({ inst, onClose, onSaved }: { inst: any; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    amount:         String(inst.outstanding > 0 ? inst.outstanding : inst.termTotal),
    term_label:     `Term ${new Date().getMonth() < 4 ? 1 : new Date().getMonth() < 8 ? 2 : 3} ${new Date().getFullYear()}`,
    payment_date:   new Date().toISOString().slice(0,10),
    payment_method: "bank",
    reference:      "",
    notes:          "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("institution_payments").insert({
        institution_id: inst.id,
        branch_id:      inst.branch_id,
        amount:         Number(form.amount),
        term_label:     form.term_label,
        payment_date:   form.payment_date,
        payment_method: form.payment_method,
        reference:      form.reference || null,
        notes:          form.notes || null,
        recorded_by:    user?.id,
      });
      if (error) throw error;
      toast.success(`Payment of ${formatKES(Number(form.amount))} recorded for ${inst.name}`);
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Record Payment</h2>
        <p className="text-xs text-muted-foreground mb-4">{inst.name} · Outstanding: <span className="font-semibold text-destructive">{formatKES(inst.outstanding)}</span></p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Amount (KES)" className="sm:col-span-2">
            <Input type="number" value={form.amount} onChange={(v) => setForm({...form,amount:v})}/>
          </Field>
          <Field label="Term">
            <Input value={form.term_label} onChange={(v) => setForm({...form,term_label:v})} placeholder="e.g. Term 2 2025"/>
          </Field>
          <Field label="Date">
            <input type="date" value={form.payment_date} onChange={(e) => setForm({...form,payment_date:e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </Field>
          <Field label="Method">
            <select value={form.payment_method} onChange={(e) => setForm({...form,payment_method:e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="bank">Bank Transfer</option>
              <option value="mpesa">M-Pesa</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </select>
          </Field>
          <Field label="Reference / M-Pesa code">
            <Input value={form.reference} onChange={(v) => setForm({...form,reference:v})} placeholder="Optional"/>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm({...form,notes:e.target.value})}
              rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

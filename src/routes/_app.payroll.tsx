import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/payroll")({ component: PayrollPage });

const STATUS_COLORS: Record<string,string> = {
  pending:  "bg-warning/15 text-warning border-warning/30",
  approved: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  paid:     "bg-success/15 text-success border-success/30",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function PayrollPage() {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const [open, setOpen] = useState(false);
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1);
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["payroll-list", selMonth, selYear, branch],
    queryFn: async () => (await supabase.from("payroll_records")
      .select("*,instructors(first_name,last_name,email)")
      .eq("month", selMonth).eq("year", selYear)
      .eq("branch_id", branch)
      .order("created_at")).data ?? [],
  });

  const totalNet = (data??[]).reduce((s:number,r:any) => s+Number(r.net_amount),0);
  const totalPaid = (data??[]).filter((r:any)=>r.status==="paid").reduce((s:number,r:any) => s+Number(r.net_amount),0);
  const pending = (data??[]).filter((r:any)=>r.status!=="paid").length;

  async function updateStatus(id:string, status:string) {
    const update: any = { status };
    if (status === "paid") { update.paid_at = new Date().toISOString(); update.paid_by = user?.id; }
    await supabase.from("payroll_records").update(update).eq("id", id);
    qc.invalidateQueries({queryKey:["payroll-list"]});
    toast.success(status === "paid" ? "Marked as paid — recorded as expenditure" : "Status updated");
    if (status === "paid") {
      const rec = (data??[]).find((r:any)=>r.id===id);
      if (rec) {
        await supabase.from("expenditures").insert({
          branch_id: branch,
          category: "instructor_pay",
          description: `Instructor pay: ${rec.instructors?.first_name} ${rec.instructors?.last_name} — ${MONTHS[rec.month-1]} ${rec.year}`,
          amount: rec.net_amount,
          expense_date: new Date().toISOString().slice(0,10),
          payment_method: "bank_transfer",
          approved_by: user?.id,
          created_by: user?.id,
        });
      }
    }
  }

  async function generateAll() {
    const { data: instructors } = await supabase.from("instructors").select("id,first_name,last_name").eq("status","active").eq("branch_id", branch);
    const { data: existing } = await supabase.from("payroll_records").select("instructor_id").eq("month",selMonth).eq("year",selYear).eq("branch_id",branch);
    const existingIds = new Set((existing??[]).map((e:any)=>e.instructor_id));
    const newOnes = (instructors??[]).filter((i:any) => !existingIds.has(i.id));
    if (!newOnes.length) { toast.info("Payroll already generated for all active instructors"); return; }
    const rows = newOnes.map((i:any) => ({
      branch_id: branch, instructor_id: i.id,
      month: selMonth, year: selYear,
      sessions_taught: 0, base_amount: 0, deductions: 0, net_amount: 0,
    }));
    await supabase.from("payroll_records").insert(rows);
    qc.invalidateQueries({queryKey:["payroll-list"]});
    toast.success(`Generated payroll for ${newOnes.length} instructors`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Payroll" value={formatKES(totalNet)} icon={<Wallet className="size-5"/>} tone="warning"/>
        <StatCard label="Paid" value={formatKES(totalPaid)} icon={<CheckCircle2 className="size-5"/>} tone="success"/>
        <StatCard label="Pending" value={pending} icon={<Wallet className="size-5"/>} tone="default"/>
      </div>

      <PageCard title="Instructor Payroll"
        action={
          <div className="flex gap-2">
            <div className="flex gap-1.5 items-center">
              <select value={selMonth} onChange={(e)=>setSelMonth(Number(e.target.value))} className="bg-background border border-input rounded-md px-2 py-1.5 text-sm">
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
              <select value={selYear} onChange={(e)=>setSelYear(Number(e.target.value))} className="bg-background border border-input rounded-md px-2 py-1.5 text-sm">
                {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={generateAll} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Auto-generate</button>
            <button onClick={()=>setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium"><Plus className="size-4"/>Add</button>
          </div>
        }>
        {isLoading && <p className="text-center text-muted-foreground py-6">Loading…</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Instructor</th>
              <th className="py-2 pr-3 text-center">Sessions</th>
              <th className="py-2 pr-3 text-right">Base</th>
              <th className="py-2 pr-3 text-right">Deductions</th>
              <th className="py-2 pr-3 text-right">Net</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Action</th>
            </tr></thead>
            <tbody>
              {(data??[]).map((rec:any) => (
                <tr key={rec.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 pr-3 font-medium">{rec.instructors?.first_name} {rec.instructors?.last_name}</td>
                  <td className="py-2.5 pr-3 text-center">{rec.sessions_taught}</td>
                  <td className="py-2.5 pr-3 text-right">{formatKES(rec.base_amount)}</td>
                  <td className="py-2.5 pr-3 text-right text-danger">{rec.deductions>0?`-${formatKES(rec.deductions)}`:"-"}</td>
                  <td className="py-2.5 pr-3 text-right font-bold text-success">{formatKES(rec.net_amount)}</td>
                  <td className="py-2.5 pr-3"><Badge className={STATUS_COLORS[rec.status]}>{rec.status}</Badge></td>
                  <td className="py-2.5">
                    <div className="flex gap-1">
                      {rec.status==="pending" && <button onClick={()=>updateStatus(rec.id,"approved")} className="text-xs px-2 py-1 rounded border border-border hover:border-accent text-muted-foreground hover:text-accent">Approve</button>}
                      {rec.status==="approved" && <button onClick={()=>updateStatus(rec.id,"paid")} className="text-xs px-2 py-1 rounded bg-success/15 text-success border border-success/30 hover:bg-success/25">Mark Paid</button>}
                      {rec.status==="paid" && <span className="text-xs text-muted-foreground">{rec.paid_at ? format(new Date(rec.paid_at),"d MMM") : ""}</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading&&!data?.length&&<tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No payroll records — click Auto-generate to create for all instructors</td></tr>}
            </tbody>
          </table>
        </div>
      </PageCard>

      {open && <PayrollForm onClose={()=>setOpen(false)} month={selMonth} year={selYear}
        onSaved={()=>{setOpen(false);qc.invalidateQueries({queryKey:["payroll-list"]});}}/>}
    </div>
  );
}

function PayrollForm({ onClose, onSaved, month, year }:{ onClose:()=>void; onSaved:()=>void; month:number; year:number }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ instructor_id:"", sessions_taught:"", base_amount:"", deductions:"0", notes:"" });
  const [saving, setSaving] = useState(false);
  const { data: instructors } = useQuery({ queryKey:["instructors-active"], queryFn: async () => (await supabase.from("instructors").select("id,first_name,last_name").eq("status","active").order("first_name")).data??[] });

  async function save() {
    if (!form.instructor_id||!form.base_amount) { toast.error("Select instructor and enter amount"); return; }
    setSaving(true);
    try {
      const base = Number(form.base_amount)||0, ded = Number(form.deductions)||0;
      const { error } = await supabase.from("payroll_records").insert({
        branch_id: branch, instructor_id: form.instructor_id,
        month, year, sessions_taught: Number(form.sessions_taught)||0,
        base_amount: base, deductions: ded, net_amount: base - ded, notes: form.notes,
      });
      if (error) throw error;
      toast.success("Payroll record added");
      onSaved();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  const net = (Number(form.base_amount)||0) - (Number(form.deductions)||0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Add Payroll Record — {MONTHS[month-1]} {year}</h2>
        <div className="space-y-3">
          <Field label="Instructor">
            <select value={form.instructor_id} onChange={(e)=>setForm({...form,instructor_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {(instructors??[]).map((i:any)=><option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>)}
            </select>
          </Field>
          <Field label="Sessions taught"><Input type="number" value={form.sessions_taught} onChange={(v)=>setForm({...form,sessions_taught:v})}/></Field>
          <Field label="Base amount (KES)"><Input type="number" value={form.base_amount} onChange={(v)=>setForm({...form,base_amount:v})}/></Field>
          <Field label="Deductions (KES)"><Input type="number" value={form.deductions} onChange={(v)=>setForm({...form,deductions:v})}/></Field>
          {net > 0 && <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2 text-sm text-center">Net pay: <span className="font-bold text-success">{formatKES(net)}</span></div>}
          <Field label="Notes"><Input value={form.notes} onChange={(v)=>setForm({...form,notes:v})} placeholder="Optional notes"/></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

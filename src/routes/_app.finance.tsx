import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES, getStatusColor, generateReceiptNumber, generateInvoiceNumber } from "@/lib/pla";
import { Plus, Printer, MessageCircle, Wallet, AlertCircle, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format, formatISO } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/finance")({
  component: FinancePage,
});

function FinancePage() {
  const [tab, setTab] = useState<"invoices" | "payments" | "arrears">("invoices");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {(["invoices", "payments", "arrears"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm capitalize border-b-2 ${tab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>
      {tab === "invoices" && <InvoicesTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "arrears" && <ArrearsTab />}
    </div>
  );
}

function InvoicesTab() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState("all");
  const [generating, setGenerating] = useState(false);

  const { data } = useQuery({
    queryKey: ["invoices-list", month, year, statusFilter],
    queryFn: async () => {
      let q = supabase.from("invoices").select("*,students(first_name,last_name,admission_number)").eq("period_month", month).eq("period_year", year);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      return (await q.order("invoice_number", { ascending: false })).data ?? [];
    },
  });

  async function bulkGenerate() {
    setGenerating(true);
    try {
      const { data: students } = await supabase.from("students").select("id,first_name,last_name").eq("status", "active");
      const { data: existing } = await supabase.from("invoices").select("student_id").eq("period_month", month).eq("period_year", year);
      const existingIds = new Set((existing ?? []).map((e: any) => e.student_id));
      const newOnes = (students ?? []).filter((s: any) => !existingIds.has(s.id));
      if (!newOnes.length) { toast.info("All invoices for this period already generated"); return; }
      const rows = await Promise.all(newOnes.map(async (s: any) => {
        const { data: enr } = await supabase.from("course_enrollments").select("courses(programs(monthly_fee))").eq("student_id", s.id);
        const total = (enr ?? []).reduce((sum: number, e: any) => sum + Number(e.courses?.programs?.monthly_fee ?? 0), 0);
        return {
          invoice_number: generateInvoiceNumber(year, month),
          student_id: s.id, period_month: month, period_year: year,
          issue_date: formatISO(new Date(), { representation: "date" }),
          due_date: formatISO(new Date(year, month - 1, 5), { representation: "date" }),
          subtotal: total, total_amount: total, amount_paid: 0, amount_outstanding: total,
          status: "sent",
        };
      }));
      const { error } = await supabase.from("invoices").insert(rows);
      if (error) throw error;
      toast.success(`Generated ${rows.length} invoices`);
      qc.invalidateQueries({ queryKey: ["invoices-list"] });
    } catch (e: any) { toast.error(e.message); } finally { setGenerating(false); }
  }

  return (
    <PageCard
      title="Invoices"
      action={
        <button onClick={bulkGenerate} disabled={generating} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">
          <Plus className="size-4" /> {generating ? "Generating…" : "Bulk Generate"}
        </button>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{format(new Date(2000, m - 1), "MMMM")}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          <option value="all">All</option><option>draft</option><option>sent</option><option>partial</option><option>paid</option><option>overdue</option>
        </select>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Invoice #</th><th>Student</th><th>Due</th><th>Total</th><th>Outstanding</th><th>Status</th></tr></thead>
        <tbody>
          {(data ?? []).map((i: any) => (
            <tr key={i.id} className="border-b border-border/50">
              <td className="py-2.5 font-mono text-xs">{i.invoice_number}</td>
              <td className="py-2.5">{i.students?.first_name} {i.students?.last_name}</td>
              <td className="py-2.5 text-muted-foreground">{format(new Date(i.due_date), "dd MMM")}</td>
              <td className="py-2.5">{formatKES(i.total_amount)}</td>
              <td className="py-2.5 font-semibold">{formatKES(i.amount_outstanding)}</td>
              <td className="py-2.5"><Badge className={getStatusColor(i.status)}>{i.status}</Badge></td>
            </tr>
          ))}
          {!data?.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No invoices for this period.</td></tr>}
        </tbody>
      </table>
    </PageCard>
  );
}

function PaymentsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showReceipt, setShowReceipt] = useState<any>(null);
  const { data } = useQuery({
    queryKey: ["payments-list"],
    queryFn: async () => (await supabase.from("payments").select("*,students(first_name,last_name,admission_number)").order("payment_date", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <PageCard
      title="Payments"
      action={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Record Payment</button>}
    >
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Receipt</th><th>Student</th><th>Method</th><th>Date</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((p: any) => (
            <tr key={p.id} className="border-b border-border/50">
              <td className="py-2.5 font-mono text-xs">{p.receipt_number}</td>
              <td className="py-2.5">{p.students?.first_name} {p.students?.last_name}</td>
              <td className="py-2.5"><Badge className={getStatusColor(p.payment_method)}>{p.payment_method}</Badge></td>
              <td className="py-2.5 text-muted-foreground">{format(new Date(p.payment_date), "dd MMM yyyy")}</td>
              <td className="py-2.5 font-semibold">{formatKES(p.amount)}</td>
              <td><button onClick={() => setShowReceipt(p)} className="p-1.5 rounded hover:bg-muted"><Printer className="size-4" /></button></td>
            </tr>
          ))}
          {!data?.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No payments.</td></tr>}
        </tbody>
      </table>
      {open && <PaymentForm onClose={() => setOpen(false)} onSaved={(p) => { setOpen(false); qc.invalidateQueries(); setShowReceipt(p); }} />}
      {showReceipt && <ReceiptModal payment={showReceipt} onClose={() => setShowReceipt(null)} />}
    </PageCard>
  );
}

function PaymentForm({ onClose, onSaved }: { onClose: () => void; onSaved: (p: any) => void }) {
  const { user } = useAuth();
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [form, setForm] = useState({
    amount: "", payment_method: "MPesa", mpesa_code: "", payment_date: formatISO(new Date(), { representation: "date" }), notes: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: students } = useQuery({
    queryKey: ["pay-students", studentSearch],
    enabled: studentSearch.length > 1,
    queryFn: async () => (await supabase.from("students").select("id,first_name,last_name,admission_number")
      .or(`first_name.ilike.%${studentSearch}%,last_name.ilike.%${studentSearch}%,admission_number.ilike.%${studentSearch}%`).limit(10)).data ?? [],
  });

  async function save() {
    if (!studentId || !form.amount) { toast.error("Select a student and enter amount"); return; }
    setSaving(true);
    try {
      const amount = Number(form.amount);
      const payment = {
        receipt_number: generateReceiptNumber(),
        student_id: studentId,
        amount,
        payment_method: form.payment_method,
        mpesa_code: form.mpesa_code || null,
        payment_date: form.payment_date,
        notes: form.notes || null,
        recorded_by: user?.id,
      };
      const { data: inserted, error } = await supabase.from("payments").insert(payment).select("*,students(first_name,last_name,admission_number)").single();
      if (error) throw error;

      // Allocate to oldest unpaid invoices
      const { data: invoices } = await supabase.from("invoices").select("*").eq("student_id", studentId).gt("amount_outstanding", 0).order("due_date");
      let remaining = amount;
      for (const inv of invoices ?? []) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, Number(inv.amount_outstanding));
        await supabase.from("payment_allocations").insert({ payment_id: inserted.id, invoice_id: inv.id, allocated_amount: apply });
        const newPaid = Number(inv.amount_paid) + apply;
        const newOut = Number(inv.total_amount) - newPaid;
        await supabase.from("invoices").update({
          amount_paid: newPaid, amount_outstanding: newOut,
          status: newOut <= 0 ? "paid" : "partial",
        }).eq("id", inv.id);
        remaining -= apply;
      }

      // Update student account
      const { data: acct } = await supabase.from("student_accounts").select("*").eq("student_id", studentId).maybeSingle();
      if (acct) {
        const newPaid = Number(acct.total_paid) + amount;
        const newOut = Math.max(Number(acct.total_fees) - newPaid, 0);
        await supabase.from("student_accounts").update({
          total_paid: newPaid, total_outstanding: newOut,
          account_status: newOut <= 0 ? "settled" : "outstanding",
        }).eq("student_id", studentId);
      } else {
        await supabase.from("student_accounts").insert({ student_id: studentId, total_fees: amount, total_paid: amount, total_outstanding: 0, account_status: "settled" });
      }

      toast.success("Payment recorded");
      onSaved(inserted);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Record Payment</h2>
        <div className="space-y-3">
          <Field label="Student">
            <Input value={studentSearch} onChange={setStudentSearch} placeholder="Search by name or admission #" />
            {students && students.length > 0 && !studentId && (
              <div className="border border-border mt-1 rounded-md max-h-40 overflow-y-auto bg-background">
                {students.map((s: any) => (
                  <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setStudentSearch(`${s.first_name} ${s.last_name} (${s.admission_number})`); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted">
                    {s.first_name} {s.last_name} · <span className="text-xs text-muted-foreground font-mono">{s.admission_number}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Amount (KES)"><Input type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} /></Field>
            <Field label="Method">
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option>MPesa</option><option>Cash</option><option>Bank Transfer</option><option>Cheque</option>
              </select>
            </Field>
            <Field label="MPesa code"><Input value={form.mpesa_code} onChange={(v) => setForm({ ...form, mpesa_code: v })} /></Field>
            <Field label="Date"><Input type="date" value={form.payment_date} onChange={(v) => setForm({ ...form, payment_date: v })} /></Field>
          </div>
          <Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving ? "Saving…" : "Save & Allocate"}</button>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({ payment, onClose }: { payment: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:bg-white">
      <div className="bg-white text-black rounded-xl w-full max-w-md p-6 print:shadow-none">
        <div className="text-center border-b border-gray-300 pb-3 mb-3">
          <div className="font-black text-xl text-purple-900">PRIME LUCK ARTS</div>
          <div className="text-[10px] tracking-[0.3em] text-amber-600">ACADEMY · NAIROBI</div>
          <div className="text-xs mt-2">OFFICIAL RECEIPT</div>
        </div>
        <div className="text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-gray-500">Receipt #</span><span className="font-mono">{payment.receipt_number}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{format(new Date(payment.payment_date), "dd MMM yyyy")}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Student</span><span>{payment.students?.first_name} {payment.students?.last_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Adm #</span><span className="font-mono">{payment.students?.admission_number}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Method</span><span>{payment.payment_method}{payment.mpesa_code ? ` · ${payment.mpesa_code}` : ""}</span></div>
          <div className="border-t border-gray-300 mt-3 pt-3 flex justify-between font-bold text-lg"><span>Amount</span><span>{formatKES(payment.amount)}</span></div>
        </div>
        <div className="text-[10px] text-center text-gray-500 mt-4">Thank you for your payment.</div>
        <div className="flex gap-2 mt-5 print:hidden">
          <button onClick={() => window.print()} className="flex-1 bg-purple-900 text-white py-2 rounded text-sm font-medium">Print</button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

function ArrearsTab() {
  const { data } = useQuery({
    queryKey: ["arrears"],
    queryFn: async () => {
      const { data: accts } = await supabase.from("student_accounts").select("*,students(first_name,last_name,admission_number)").gt("total_outstanding", 0).order("total_outstanding", { ascending: false });
      // get oldest unpaid invoice per student to compute aging
      const result = [];
      for (const a of accts ?? []) {
        const { data: oldest } = await supabase.from("invoices").select("due_date").eq("student_id", a.student_id).gt("amount_outstanding", 0).order("due_date").limit(1).maybeSingle();
        let ageMonths = 0;
        if (oldest) {
          const due = new Date(oldest.due_date);
          ageMonths = Math.max(0, Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24 * 30)));
        }
        result.push({ ...a, age: ageMonths });
      }
      return result;
    },
  });

  const totals = useMemo(() => {
    const a = data ?? [];
    return {
      total: a.reduce((s, x: any) => s + Number(x.total_outstanding), 0),
      students: a.length,
      overdue: a.filter((x: any) => x.age > 1).length,
    };
  }, [data]);

  function sendReminder(row: any) {
    const phone = ""; // could fetch parent's whatsapp
    const msg = encodeURIComponent(`Dear Parent, this is a friendly reminder that ${row.students?.first_name} ${row.students?.last_name} has an outstanding balance of ${formatKES(row.total_outstanding)} at PrimeLuck Arts Academy. Kindly settle at your earliest convenience. Thank you.`);
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Arrears" value={formatKES(totals.total)} icon={<Wallet className="size-5" />} tone="danger" />
        <StatCard label="Students Owing" value={totals.students} icon={<AlertCircle className="size-5" />} tone="warning" />
        <StatCard label="2+ Months Overdue" value={totals.overdue} icon={<Receipt className="size-5" />} tone="danger" />
      </div>
      <PageCard title="Arrears" subtitle="Sorted by amount owing">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Adm #</th><th>Student</th><th>Aging</th><th className="text-right">Outstanding</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((a: any) => (
              <tr key={a.id} className="border-b border-border/50">
                <td className="py-2.5 font-mono text-xs">{a.students?.admission_number}</td>
                <td className="py-2.5">{a.students?.first_name} {a.students?.last_name}</td>
                <td className="py-2.5"><Badge className={getStatusColor(a.age >= 2 ? "overdue" : a.age >= 1 ? "partial" : "active")}>{a.age === 0 ? "Current" : `${a.age}m overdue`}</Badge></td>
                <td className="py-2.5 text-right font-bold text-danger">{formatKES(a.total_outstanding)}</td>
                <td><button onClick={() => sendReminder(a)} className="text-xs text-accent inline-flex items-center gap-1"><MessageCircle className="size-4" /> Remind</button></td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">All clear — no arrears.</td></tr>}
          </tbody>
        </table>
      </PageCard>
    </div>
  );
}

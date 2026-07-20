import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES, getStatusColor, generateReceiptNumber, generateInvoiceNumber } from "@/lib/pla";
import { Plus, Printer, MessageCircle, Wallet, AlertCircle, Receipt, TrendingUp, TrendingDown, Paperclip, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, formatISO } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/finance")({ component: FinancePage });


// ── Profit Summary (admin only) ──────────────────────────────────────────────
function ProfitSummary({ branch }: { branch: string }) {
  const [period, setPeriod] = useState<"month"|"term"|"year"|"all">("month");

  const now = new Date();
  const fromDate = period === "month"
    ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
    : period === "term"
    ? new Date(now.getFullYear(), Math.floor(now.getMonth()/4)*4, 1).toISOString().slice(0,10)
    : period === "year"
    ? `${now.getFullYear()}-01-01`
    : "2000-01-01";

  // Student payments collected
  const { data: payments } = useQuery({
    queryKey: ["profit-payments", branch, fromDate],
    queryFn: async () => {
      let q = supabase.from("payments").select("amount,payment_date").gte("payment_date", fromDate);
      if (branch) q = q.eq("branch_id", branch);
      // already filtered
      return (await q).data ?? [];
    },
  });

  // Income records
  const { data: income } = useQuery({
    queryKey: ["profit-income", branch, fromDate],
    queryFn: async () =>
      (await supabase.from("income_records").select("amount").eq("branch_id", branch).gte("income_date", fromDate)).data ?? [],
  });

  // Expenditures
  const { data: expenditures } = useQuery({
    queryKey: ["profit-expenditures", branch, fromDate],
    queryFn: async () =>
      (await supabase.from("expenditures").select("amount").eq("branch_id", branch).gte("expense_date", fromDate)).data ?? [],
  });

  // Approved fund requests
  const { data: fundRequests } = useQuery({
    queryKey: ["profit-fund", branch, fromDate],
    queryFn: async () =>
      (await supabase.from("fund_requests").select("amount").eq("branch_id", branch).eq("status","approved").gte("created_at", fromDate)).data ?? [],
  });

  const totalPayments   = (payments??[]).reduce((s:number,p:any)=>s+Number(p.amount),0);
  const totalIncome     = (income??[]).reduce((s:number,r:any)=>s+Number(r.amount),0);
  const totalExpend     = (expenditures??[]).reduce((s:number,e:any)=>s+Number(e.amount),0);
  const totalFundReqs   = (fundRequests??[]).reduce((s:number,f:any)=>s+Number(f.amount||0),0);

  const grossRevenue = totalPayments + totalIncome;
  const totalExpenses = totalExpend + totalFundReqs;
  const netProfit = grossRevenue - totalExpenses;
  const margin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : "0";
  const isProfit = netProfit >= 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <span className="text-base">📊</span> Profit & Loss Summary
        </h2>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["month","term","year","all"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${period===p ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p === "all" ? "All time" : `This ${p}`}
            </button>
          ))}
        </div>
      </div>

      {/* Net profit — big number */}
      <div className={`rounded-xl p-4 text-center ${isProfit ? "bg-success/10 border border-success/20" : "bg-danger/10 border border-danger/20"}`}>
        <p className="text-xs text-muted-foreground mb-1">{isProfit ? "Net Profit" : "Net Loss"}</p>
        <p className={`text-3xl font-bold ${isProfit ? "text-success" : "text-danger"}`}>{formatKES(Math.abs(netProfit))}</p>
        <p className="text-xs text-muted-foreground mt-1">Profit margin: {isProfit ? "+" : "-"}{Math.abs(Number(margin))}%</p>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-success/5 border border-success/20 p-3">
          <p className="text-xs text-muted-foreground mb-1">💰 Total Revenue</p>
          <p className="text-lg font-bold text-success">{formatKES(grossRevenue)}</p>
          <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
            <div className="flex justify-between"><span>Student fees</span><span>{formatKES(totalPayments)}</span></div>
            <div className="flex justify-between"><span>Other income</span><span>{formatKES(totalIncome)}</span></div>
          </div>
        </div>
        <div className="rounded-xl bg-danger/5 border border-danger/20 p-3">
          <p className="text-xs text-muted-foreground mb-1">💸 Total Expenses</p>
          <p className="text-lg font-bold text-danger">{formatKES(totalExpenses)}</p>
          <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
            <div className="flex justify-between"><span>Expenditures</span><span>{formatKES(totalExpend)}</span></div>
            <div className="flex justify-between"><span>Fund requests</span><span>{formatKES(totalFundReqs)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinancePage() {
  const { user, activeBranch } = useAuth();
  const isDice = user?.role === "dice_admin";
  const [tab, setTab] = useState<"invoices"|"payments"|"arrears"|"expenditure"|"income">("invoices");

  const tabs = (isDice || user?.role === "super_admin" || user?.role === "finance_admin")
    ? ["invoices","payments","arrears","expenditure","income"] as const
    : ["invoices","payments","arrears","expenditure"] as const;

  const isAdmin = ["super_admin","finance_admin","dice_admin"].includes(user?.role ?? "");
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";

  return (
    <div className="space-y-4">
      {isAdmin && <ProfitSummary branch={branch} />}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t as any)}
            className={`px-4 py-2 text-sm capitalize whitespace-nowrap border-b-2 ${tab===t?"border-accent text-accent":"border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab==="invoices"     && <InvoicesTab />}
      {tab==="payments"     && <PaymentsTab />}
      {tab==="arrears"      && <ArrearsTab />}
      {tab==="expenditure"  && <ExpenditureTab />}
      {tab==="income"       && <IncomeTab />}
    </div>
  );
}

/* ── INVOICES ── */
function InvoicesTab() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth()+1);
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [showTermly, setShowTermly] = useState(false);

  const invBranch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const { data } = useQuery({
    queryKey:["invoices-list", month, year, statusFilter, invBranch],
    queryFn: async () => {
      if (!invBranch) return [];
      // Two-step: resolve branch student IDs first — reliable, no join-filter ambiguity
      const { data: branchStudents } = await supabase.from("students").select("id").eq("branch_id", invBranch);
      const studentIds = (branchStudents??[]).map((s:any)=>s.id);
      if (!studentIds.length) return [];
      let q = supabase.from("invoices")
        .select("*,students(first_name,last_name,admission_number,branch_id)")
        .in("student_id", studentIds)
        .eq("period_month", month).eq("period_year", year);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      return (await q.order("invoice_number", {ascending:false})).data ?? [];
    },
  });

  async function bulkGenerate() {
    setGenerating(true);
    try {
      const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
      let q = supabase.from("students").select("id,first_name,last_name,branch_id").eq("status","active");
      if (branch) q = q.eq("branch_id", branch);
      const { data: students } = await q;
      const { data: existing } = await supabase.from("invoices").select("student_id")
        .eq("period_month", month).eq("period_year", year).eq("billing_type","monthly");
      const existingIds = new Set((existing??[]).map((e:any) => e.student_id));
      const newOnes = (students??[]).filter((s:any) => !existingIds.has(s.id));
      if (!newOnes.length) { toast.info("All invoices already generated"); return; }
      const rows = await Promise.all(newOnes.map(async (s:any) => {
        const { data: enr } = await supabase.from("course_enrollments")
          .select("fee_override,courses(monthly_fee,programs(monthly_fee))").eq("student_id", s.id);
        const total = (enr??[]).reduce((sum:number,e:any) => {
          if (e.fee_override) return sum + Number(e.fee_override);
          const courseFee = e.courses?.monthly_fee ?? e.courses?.programs?.monthly_fee ?? 0;
          return sum + Number(courseFee);
        }, 0);
        return {
          invoice_number: generateInvoiceNumber(year, month),
          student_id: s.id, period_month: month, period_year: year,
          issue_date: formatISO(new Date(),{representation:"date"}),
          due_date: formatISO(new Date(year, month-1, 5),{representation:"date"}),
          subtotal: total, total_amount: total, amount_paid: 0, amount_outstanding: total,
          status:"sent", billing_type:"monthly",
        };
      }));
      const { error } = await supabase.from("invoices").insert(rows);
      if (error) throw error;

      // Update student_accounts — ACCUMULATE total_fees and total_outstanding
      for (const row of rows) {
        const { data: acct } = await supabase.from("student_accounts")
          .select("*").eq("student_id", row.student_id).limit(1);
        if (acct?.[0]) {
          await supabase.from("student_accounts").update({
            total_fees: Number(acct[0].total_fees||0) + Number(row.total_amount),
            total_outstanding: Number(acct[0].total_outstanding||0) + Number(row.total_amount),
            account_status: "outstanding",
          }).eq("student_id", row.student_id);
        } else {
          await supabase.from("student_accounts").insert({
            student_id: row.student_id,
            total_fees: Number(row.total_amount),
            total_outstanding: Number(row.total_amount),
            total_paid: 0,
            account_status: "outstanding",
          });
        }
      }

      toast.success(`Generated ${rows.length} invoices`);
      qc.invalidateQueries({queryKey:["invoices-list"]});
    } catch(e:any) { toast.error(e.message); } finally { setGenerating(false); }
  }

  return (
    <PageCard title="Invoices"
      action={
        <div className="flex gap-2">
          <button onClick={() => setShowTermly(!showTermly)}
            className={`px-3 py-2 text-sm rounded-md border ${showTermly?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground"}`}>
            Termly
          </button>
          <button onClick={bulkGenerate} disabled={generating}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">
            <Plus className="size-4"/>{generating?"Generating…":"Monthly Bulk"}
          </button>
        </div>
      }>
      {showTermly && <TermlyGenerator onGenerated={() => qc.invalidateQueries({queryKey:["invoices-list"]})} />}
      <div className="flex flex-wrap gap-2 mb-4 mt-4">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          {Array.from({length:12},(_,i)=>i+1).map((m) => <option key={m} value={m}>{format(new Date(2000,m-1),"MMMM")}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          {Array.from({length:5},(_,i)=>now.getFullYear()-2+i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          <option value="all">All</option><option>draft</option><option>sent</option>
          <option>partial</option><option>paid</option><option>overdue</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-3">Invoice #</th><th className="py-2 pr-3">Student</th>
            <th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Total</th>
            <th className="py-2 pr-3">Outstanding</th><th className="py-2">Status</th>
          </tr></thead>
          <tbody>
            {(data??[]).map((inv:any) => (
              <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2.5 pr-3 font-mono text-xs">{inv.invoice_number}</td>
                <td className="py-2.5 pr-3">{inv.students?.first_name} {inv.students?.last_name}</td>
                <td className="py-2.5 pr-3"><Badge className={inv.billing_type==="termly"?"bg-purple-500/15 text-purple-400 border-purple-500/30":"bg-blue-500/15 text-blue-400 border-blue-500/30"}>{inv.billing_type}</Badge></td>
                <td className="py-2.5 pr-3 font-semibold">{formatKES(inv.total_amount)}</td>
                <td className="py-2.5 pr-3 text-danger font-semibold">{formatKES(inv.amount_outstanding)}</td>
                <td className="py-2.5"><Badge className={getStatusColor(inv.status)}>{inv.status}</Badge></td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No invoices for this period</td></tr>}
          </tbody>
        </table>
      </div>
    </PageCard>
  );
}

/* ── TERMLY GENERATOR ── */
function TermlyGenerator({ onGenerated }:{ onGenerated:()=>void }) {
  const { user, activeBranch } = useAuth();
  const [termId, setTermId] = useState("");
  const [typeFilter, setTypeFilter] = useState("institution");
  const [generating, setGenerating] = useState(false);
  const { data: terms } = useQuery({
    queryKey:["terms-list"],
    queryFn: async () => (await supabase.from("terms").select("*").order("year").order("term_number")).data??[],
  });
  async function generate() {
    if (!termId) { toast.error("Select a term"); return; }
    setGenerating(true);
    try {
      const term = (terms??[]).find((t:any) => t.id === termId);
      const branchFin = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
      let q = supabase.from("students").select("id,first_name,last_name,student_type").eq("status","active").eq("student_type", typeFilter);
      if (branchFin) q = q.eq("branch_id", branchFin);
      const { data: students } = await q;
      const { data: existing } = await supabase.from("invoices").select("student_id").eq("term_id", termId).eq("billing_type","termly");
      const existingIds = new Set((existing??[]).map((e:any) => e.student_id));
      const newOnes = (students??[]).filter((s:any) => !existingIds.has(s.id));
      if (!newOnes.length) { toast.info("Already generated for this group"); return; }
      const rows = await Promise.all(newOnes.map(async (s:any) => {
        const { data: enr } = await supabase.from("course_enrollments")
          .select("fee_override,courses(term_fee,monthly_fee,billing_cycle,programs(term_fee,monthly_fee,billing_cycle))").eq("student_id", s.id);
        const total = (enr??[]).reduce((sum:number,e:any) => {
          if (e.fee_override) return sum + Number(e.fee_override);
          const c = e.courses;
          const cycle = c?.billing_cycle ?? c?.programs?.billing_cycle;
          const termFee = c?.term_fee ?? c?.programs?.term_fee;
          const monthlyFee = c?.monthly_fee ?? c?.programs?.monthly_fee ?? 0;
          return sum + Number(cycle === "termly" ? termFee : monthlyFee * 3);
        }, 0);
        const n = new Date();
        return {
          invoice_number:`TINV-${term?.year}-T${term?.term_number}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
          student_id: s.id, period_month: n.getMonth()+1, period_year: term?.year??n.getFullYear(),
          issue_date: n.toISOString().slice(0,10), due_date: term?.start_date??n.toISOString().slice(0,10),
          subtotal: total, total_amount: total, amount_paid: 0, amount_outstanding: total,
          status:"sent", billing_type:"termly", term_id: termId,
        };
      }));
      const { error } = await supabase.from("invoices").insert(rows);
      if (error) throw error;
      toast.success(`Generated ${rows.length} termly invoices for ${term?.name}`);
      onGenerated();
    } catch(e:any) { toast.error(e.message); } finally { setGenerating(false); }
  }
  return (
    <div className="border border-accent/30 rounded-xl bg-accent/5 p-4 space-y-3 mb-2">
      <div className="text-sm font-semibold text-accent">Termly Invoice Generator</div>
      <div className="flex flex-wrap gap-2">
        <select value={termId} onChange={(e) => setTermId(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm flex-1 min-w-[180px]">
          <option value="">— Select term —</option>
          {(terms??[]).map((t:any) => <option key={t.id} value={t.id}>{t.name}{t.is_current?" ★":""}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          <option value="institution">Institutions</option>
          <option value="junior">Juniors</option>
          <option value="teen">Teens</option>
          <option value="adult">Adults</option>
        </select>
        <button onClick={generate} disabled={generating||!termId}
          className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
          {generating?"Generating…":"Generate"}
        </button>
      </div>
    </div>
  );
}

/* ── PAYMENTS ── */
function PaymentsTab() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey:["payments-list", user?.role === "super_admin" ? activeBranch : user?.branch_id],
    queryFn: async () => {
      const branchP = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
      let qP = supabase.from("payments").select("*,students(first_name,last_name,admission_number)").order("payment_date",{ascending:false}).limit(50);
      if (branchP) qP = qP.eq("branch_id", branchP);
      return (await qP).data??[];
    },
  });
  return (
    <PageCard title="Payments" action={
      (user?.role==="super_admin"||user?.role==="finance_admin"||user?.role==="dice_admin") &&
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4"/>Record Payment</button>
    }>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <th className="py-2 pr-3">Receipt #</th><th className="py-2 pr-3">Student</th>
          <th className="py-2 pr-3">Method</th><th className="py-2 pr-3">Date</th><th className="py-2 text-right">Amount</th>
        </tr></thead>
        <tbody>
          {(data??[]).map((p:any) => (
            <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2.5 pr-3 font-mono text-xs">{p.receipt_number}</td>
              <td className="py-2.5 pr-3">{p.students?.first_name} {p.students?.last_name}</td>
              <td className="py-2.5 pr-3 capitalize">{p.payment_method}</td>
              <td className="py-2.5 pr-3 text-muted-foreground text-xs">{p.payment_date}</td>
              <td className="py-2.5 text-right font-bold text-success">{formatKES(p.amount)}</td>
            </tr>
          ))}
          {!data?.length && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No payments yet</td></tr>}
        </tbody>
      </table>
      {open && <PaymentForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({queryKey:["payments-list"]}); }}/>}
    </PageCard>
  );
}

function PaymentForm({ onClose, onSaved }:{ onClose:()=>void; onSaved:()=>void }) {
  const { user, activeBranch } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [form, setForm] = useState({ amount:"", payment_method:"MPesa", mpesa_code:"", notes:"", payment_date: new Date().toISOString().slice(0,10) });
  const [saving, setSaving] = useState(false);
  const payBranch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const { data: students } = useQuery({
    queryKey:["students-active", payBranch],
    queryFn: async () => {
      let q = supabase.from("students").select("id,first_name,last_name,admission_number").eq("status","active");
      if (payBranch) q = q.eq("branch_id", payBranch);
      return (await q.order("first_name")).data??[];
    },
  });
  async function save() {
    if (!studentId||!form.amount) { toast.error("Select student and enter amount"); return; }
    setSaving(true);
    try {
      const amount = Number(form.amount);
      const { error, data: newPay } = await supabase.from("payments").insert({
        student_id: studentId, amount,
        receipt_number: generateReceiptNumber(),
        payment_method: form.payment_method,
        mpesa_code: form.mpesa_code||null,
        notes: form.notes||null,
        payment_date: form.payment_date,
        branch_id: payBranch,
      });
      if (error) throw error;
      // Update student account
      const { data: acct } = await supabase.from("student_accounts").select("*").eq("student_id",studentId).limit(1);
      if (acct?.[0]) {
        await supabase.from("student_accounts").update({
          total_paid: Number(acct[0].total_paid||0) + amount,
          total_outstanding: Math.max(0, Number(acct[0].total_outstanding||0) - amount),
          account_status: Math.max(0, Number(acct[0].total_outstanding||0)-amount) <= 0 ? "clear" : "outstanding",
          last_payment_date: form.payment_date,
        }).eq("student_id", studentId);
      }
      // Allocate payment against invoices oldest-first (spec requirement)
      const { data: openInvoices } = await supabase.from("invoices")
        .select("id,total_amount,amount_paid,amount_outstanding")
        .eq("student_id", studentId)
        .in("status", ["sent","overdue","partially_paid"])
        .gt("amount_outstanding", 0)
        .order("period_year",{ascending:true}).order("period_month",{ascending:true});
      let remaining = amount;
      for (const inv of (openInvoices??[])) {
        if (remaining <= 0) break;
        const owed = Number(inv.amount_outstanding);
        const applying = Math.min(remaining, owed);
        const newPaid = Number(inv.amount_paid) + applying;
        const newOwed = owed - applying;
        await supabase.from("invoices").update({
          amount_paid: newPaid,
          amount_outstanding: newOwed,
          status: newOwed <= 0 ? "paid" : "partially_paid",
        }).eq("id", inv.id);
        remaining -= applying;
      }
      toast.success("Payment recorded");
      onSaved();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Record Payment</h2>
        <div className="space-y-3">
          <Field label="Student">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select student —</option>
              {(students??[]).map((s:any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.admission_number})</option>)}
            </select>
          </Field>
          <Field label="Amount (KES)"><Input type="number" value={form.amount} onChange={(v) => setForm({...form,amount:v})}/></Field>
          <Field label="Payment method">
            <select value={form.payment_method} onChange={(e) => setForm({...form,payment_method:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>MPesa</option><option>Cash</option><option>Bank Transfer</option><option>Cheque</option>
            </select>
          </Field>
          {form.payment_method==="MPesa" && <Field label="MPesa code"><Input value={form.mpesa_code} onChange={(v) => setForm({...form,mpesa_code:v})} placeholder="e.g. QHK1234XYZ"/></Field>}
          <Field label="Payment date"><Input type="date" value={form.payment_date} onChange={(v) => setForm({...form,payment_date:v})}/></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(v) => setForm({...form,notes:v})}/></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── ARREARS ── */
function ArrearsTab() {
  const { user, activeBranch } = useAuth();
  const arrearsBranch = user?.role === "super_admin" ? (activeBranch ?? "") : (user?.branch_id ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [balanceFilter, setBalanceFilter] = useState<"all"|"owing"|"clear">("all");

  const { data, isLoading } = useQuery({
    queryKey:["arrears-list", arrearsBranch],
    queryFn: async () => {
      if (!arrearsBranch) return [];

      // 1. Active students with parent contacts
      const { data: branchStudents } = await supabase.from("students")
        .select("id,first_name,last_name,admission_number,student_parents(parents(first_name,last_name,whatsapp,phone))")
        .eq("branch_id", arrearsBranch).eq("status","active");
      const studentIds = (branchStudents??[]).map((s:any) => s.id);
      if (!studentIds.length) return [];

      // 2. Course enrollment + SESSION FEE (per_session_billing)
      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("student_id,fee_override,courses(id,name,session_fee,per_session_billing,monthly_fee,billing_cycle)")
        .in("student_id", studentIds);

      // 3. All sessions for this branch
      const { data: allSessions } = await supabase.from("sessions")
        .select("id,session_date,start_time,course_id")
        .in("course_id", [...new Set((enrollments??[]).map((e:any) => e.courses?.id).filter(Boolean))])
        .order("session_date",{ascending:true});

      // 4. PRESENT attendance only — this drives the fee
      const { data: presentRecs } = await supabase.from("attendance_records")
        .select("student_id,session_id")
        .in("student_id", studentIds)
        .eq("status","present");

      // 5. Payments made
      const { data: accounts } = await supabase.from("student_accounts")
        .select("student_id,total_paid").in("student_id", studentIds);

      // Maps
      const studentMap: Record<string,any> = {};
      for (const s of (branchStudents??[])) studentMap[s.id] = s;

      // Per student: session fee (prefer per_session fee, fallback monthly/12)
      const feeMap: Record<string,number> = {};
      const billingMap: Record<string,string> = {};
      for (const e of (enrollments??[])) {
        const c = e.courses as any;
        const isPerSession = c?.per_session_billing || c?.billing_cycle === "per_session";
        const fee = isPerSession
          ? Number(e.fee_override ?? c?.session_fee ?? 0)
          : Number(e.fee_override ?? c?.monthly_fee ?? 0);
        if (fee > (feeMap[e.student_id]??0)) {
          feeMap[e.student_id] = fee;
          billingMap[e.student_id] = isPerSession ? "per_session" : "monthly";
        }
      }

      const sessionMap: Record<string,{date:string;time:string}> = {};
      for (const sess of (allSessions??[])) {
        sessionMap[sess.id] = {
          date: sess.session_date,
          time: (sess.start_time||"").substring(0,5)
        };
      }

      const paidMap: Record<string,number> = {};
      for (const a of (accounts??[])) paidMap[a.student_id] = Number((a as any).total_paid ?? 0);

      // Group PRESENT sessions per student
      const presentSessions: Record<string,Array<{date:string;time:string}>> = {};
      for (const ar of (presentRecs??[])) {
        const sess = sessionMap[ar.session_id];
        if (!sess) continue;
        if (!presentSessions[ar.student_id]) presentSessions[ar.student_id] = [];
        presentSessions[ar.student_id].push(sess);
      }

      const rows = studentIds.map((sid:string) => {
        const student = studentMap[sid];
        const sessionFee = feeMap[sid] ?? 0;
        const billing = billingMap[sid] ?? "per_session";
        const totalPaid = paidMap[sid] ?? 0;
        const sessions = (presentSessions[sid] ?? [])
          .sort((a,b) => a.date.localeCompare(b.date));

        // Cumulative = sessions attended × session fee − paid
        const totalOwed = sessions.length * sessionFee;
        const cumulative = Math.max(0, totalOwed - totalPaid);

        return {
          student, sessions, cumulative,
          sessionFee, billing, totalPaid,
          sessionCount: sessions.length,
          totalOwed,
        };
      }).filter((r:any) => r.student);

      return rows.sort((a:any,b:any) => {
        if (a.cumulative>0&&b.cumulative===0) return -1;
        if (a.cumulative===0&&b.cumulative>0) return 1;
        if (a.cumulative>0&&b.cumulative>0) return b.cumulative-a.cumulative;
        return `${a.student?.first_name??""} ${a.student?.last_name??""}`.localeCompare(`${b.student?.first_name??""} ${b.student?.last_name??""}`);
      });
    },
  });

  const allRows = (data??[]);
  const rows = balanceFilter==="owing" ? allRows.filter((r:any)=>r.cumulative>0)
             : balanceFilter==="clear"  ? allRows.filter((r:any)=>r.cumulative===0)
             : allRows;
  const totalArrears  = allRows.reduce((s:number,r:any)=>s+r.cumulative,0);
  const owingCount    = allRows.filter((r:any)=>r.cumulative>0).length;
  const clearCount    = allRows.filter((r:any)=>r.cumulative===0).length;
  const totalStudents = allRows.length;

  function sendWhatsApp(row:any) {
    const parent = row.student?.student_parents?.[0]?.parents;
    const phone = (parent?.whatsapp||parent?.phone||"").replace(/\D/g,"");
    if (!phone) { toast.error("No WhatsApp number"); return; }
    const breakdown = row.sessions.map((s:any)=>
      `  • ${s.date} ${s.time} — KES ${Number(row.sessionFee).toLocaleString("en-KE")}`
    ).join("\n");
    const msg = `Hello ${parent?.first_name||"Parent"},\n\n${row.student?.first_name} has an outstanding balance of KES ${Number(row.cumulative).toLocaleString("en-KE")}.\n\nSessions attended:\n${breakdown}\n\nTotal owed: KES ${Number(row.totalOwed).toLocaleString("en-KE")}\nPaid: KES ${Number(row.totalPaid).toLocaleString("en-KE")}\nBalance: KES ${Number(row.cumulative).toLocaleString("en-KE")}\n\nPlease make payment at your earliest convenience. Thank you!`;
    const num = phone.startsWith("0")?"254"+phone.slice(1):phone;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Arrears"  value={formatKES(totalArrears)} icon={<AlertCircle className="size-5"/>} tone="danger"/>
        <StatCard label="Owing"          value={owingCount}              icon={<Wallet className="size-5"/>}      tone="warning"/>
        <StatCard label="Clear"          value={clearCount}              icon={<Receipt className="size-5"/>}     tone="success"/>
        <StatCard label="Total Students" value={totalStudents}           icon={<AlertCircle className="size-5"/>} tone="gold"/>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {(["all","owing","clear"] as const).map(v=>(
          <button key={v} onClick={()=>setBalanceFilter(v)}
            className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-all "+(balanceFilter===v?"bg-card text-foreground shadow-sm":"text-muted-foreground hover:text-foreground")}>
            {v==="all"?"All Students":v==="owing"?"Owing Only":"Clear Only"}
          </button>
        ))}
      </div>

      <PageCard title="Cumulative Arrears" subtitle="Calculated from attendance — only sessions marked Present are charged">
        {isLoading && <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>}
        <div className="space-y-1">
          {rows.map((row:any)=>{
            const sid = row.student?.id;
            const isOpen = expanded.has(sid);
            const parent = row.student?.student_parents?.[0]?.parents;
            const hasWA = !!(parent?.whatsapp||parent?.phone);
            return (
              <div key={sid} className="rounded-lg border border-border/60 overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left"
                  onClick={()=>{ const n=new Set(expanded); isOpen?n.delete(sid):n.add(sid); setExpanded(n); }}>
                  <span className="text-muted-foreground text-xs">{isOpen?"▾":"›"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{row.student?.first_name} {row.student?.last_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{row.student?.admission_number}</span>
                    {parent && <span className="text-xs text-muted-foreground ml-2">· {parent.first_name}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.cumulative===0
                      ? <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">✓ Clear</span>
                      : <>
                          <span className="text-xs text-muted-foreground">{row.sessionCount} session{row.sessionCount!==1?"s":""}</span>
                          <span className="font-bold text-danger text-sm">{formatKES(row.cumulative)}</span>
                        </>}
                    <button
                      onClick={e=>{e.stopPropagation(); sendWhatsApp(row);}}
                      className={"px-2 py-1 rounded text-xs font-medium "+(hasWA?"bg-[#25D366] text-white":"bg-muted text-muted-foreground")}>
                      WA
                    </button>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 pt-1 border-t border-border/40 bg-muted/20">
                    <div className="text-xs text-muted-foreground mb-2">
                      {formatKES(row.sessionFee)} per session · {row.sessionCount} present · Paid: {formatKES(row.totalPaid)}
                    </div>
                    {row.sessions.length > 0 ? (
                      <div className="space-y-1">
                        {row.sessions.map((sess:any,i:number)=>(
                          <div key={i} className="flex justify-between text-xs py-1 border-b border-border/30 last:border-0">
                            <span className="text-muted-foreground">{sess.date} {sess.time && `· ${sess.time}`}</span>
                            <span className="text-danger font-medium">{formatKES(row.sessionFee)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs py-1 font-semibold border-t border-border mt-1 pt-1">
                          <span>Total owed</span><span className="text-danger">{formatKES(row.totalOwed)}</span>
                        </div>
                        {row.totalPaid>0&&(
                          <div className="flex justify-between text-xs py-0.5 font-semibold">
                            <span className="text-success">Paid</span><span className="text-success">− {formatKES(row.totalPaid)}</span>
                          </div>
                        )}
                        {row.cumulative>0&&(
                          <div className="flex justify-between text-xs py-0.5 font-bold">
                            <span className="text-danger">Balance due</span><span className="text-danger">{formatKES(row.cumulative)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground py-2">Not marked present in any session — no charge</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading&&!rows.length&&<div className="py-8 text-center text-muted-foreground text-sm">No students</div>}
        </div>
      </PageCard>
    </div>
  );
}


/* ── EXPENDITURE ── */
function ExpenditureTab() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const branchId = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const { data, isLoading } = useQuery({
    queryKey:["expenditures-list", branchId],
    queryFn: async () => (await supabase.from("expenditures").select("*").eq("branch_id", branchId).order("expense_date",{ascending:false})).data??[],
  });
  const total = (data??[]).reduce((s:number,e:any)=>s+Number(e.amount),0);
  return (
    <div className="space-y-4">
      <StatCard label="Total Expenditure" value={formatKES(total)} icon={<TrendingDown className="size-5"/>} tone="danger"/>
      <PageCard title="Expenditures" action={
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4"/>Add</button>
      }>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Method</th>
            <th className="py-2 pr-3 text-center">Receipt</th>
            <th className="py-2 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(data??[]).map((e:any) => (
              <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2.5 pr-3 text-xs text-muted-foreground">{e.expense_date}</td>
                <td className="py-2.5 pr-3"><Badge className="bg-muted text-muted-foreground border-border">{e.category}</Badge></td>
                <td className="py-2.5 pr-3">{e.description}</td>
                <td className="py-2.5 pr-3 text-xs capitalize">{e.payment_method}</td>
                <td className="py-2.5 pr-3 text-center">
                  {e.receipt_path ? (
                    <a href={supabase.storage.from("receipts").getPublicUrl(e.receipt_path).data.publicUrl}
                      target="_blank" rel="noopener noreferrer"
                      title="View receipt"
                      className="inline-flex items-center justify-center size-7 rounded-md bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors">
                      {e.receipt_path.endsWith(".pdf") ? <FileText className="size-3.5"/> : <Paperclip className="size-3.5"/>}
                    </a>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right font-semibold text-danger">{formatKES(e.amount)}</td>
              </tr>
            ))}
            {!isLoading && !data?.length && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No expenditures recorded</td></tr>}
          </tbody>
        </table>
      </PageCard>
      {open && <ExpForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({queryKey:["expenditures-list"]}); }}/>}
    </div>
  );
}

function ExpForm({ onClose, onSaved }:{ onClose:()=>void; onSaved:()=>void }) {
  const { user, activeBranch } = useAuth();
  // Always compute branch inside form — never rely on stale prop from parent
  const branch = (user?.role === "super_admin" || user?.role === "dice_admin")
    ? (activeBranch || user?.branch_id || "")
    : (user?.branch_id || "");
  const [form, setForm] = useState({ category:"", description:"", amount:"", expense_date: new Date().toISOString().slice(0,10), payment_method:"cash", receipt_ref:"" });
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File|null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>("");

  function onReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    if (file.type.startsWith("image/")) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview("pdf");
    }
  }
  const CATS = ["Rent","Utilities","Instructor Pay","Transport","Supplies","Marketing","Maintenance","Other"];
  async function save() {
    if (!form.category || !form.description || !form.amount) { toast.error("Fill all required fields"); return; }
    if (!branch) { toast.error("Branch not set — please refresh and try again", { duration: 8000 }); return; }
    setSaving(true);
    try {
      const amount = Number(form.amount);
      if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount greater than 0"); setSaving(false); return; }
      let receiptPath: string|null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() ?? "jpg";
        const path = `${branch}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, receiptFile, { upsert: true });
        if (!upErr) receiptPath = path;
      }
      const { error } = await supabase.from("expenditures").insert({
        branch_id: branch,
        category: form.category,
        description: form.description.trim(),
        amount,
        expense_date: form.expense_date,
        payment_method: form.payment_method,
        receipt_ref: form.receipt_ref.trim() || null,
        created_by: user?.id ?? null,
        receipt_path: receiptPath,
      });
      if (error) throw new Error(error.message);
      toast.success("Expenditure recorded" + (receiptPath ? " · receipt uploaded ✓" : ""));
      onSaved();
    } catch(e:any) { toast.error("Failed to save: " + (e.message ?? "Unknown error"), { duration: 8000 }); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-2">Record Expenditure</h2>
        <div className="text-xs text-muted-foreground mb-3 px-1">
          Saving to: <span className="font-semibold text-accent">{branch === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy"}</span>
          {!branch && <span className="text-danger ml-1">⚠ Branch not detected — refresh page</span>}
        </div>
        <div className="space-y-3">
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({...form,category:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {CATS.map((c) => <option key={c} value={c.toLowerCase().replace(/ /g,"_")}>{c}</option>)}
            </select>
          </Field>
          <Field label="Description"><Input value={form.description} onChange={(v) => setForm({...form,description:v})}/></Field>
          <Field label="Amount (KES)"><Input type="number" value={form.amount} onChange={(v) => setForm({...form,amount:v})}/></Field>
          <Field label="Date"><Input type="date" value={form.expense_date} onChange={(v) => setForm({...form,expense_date:v})}/></Field>
          <Field label="Payment method">
            <select value={form.payment_method} onChange={(e) => setForm({...form,payment_method:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="cash">Cash</option><option value="mpesa">MPesa</option><option value="bank_transfer">Bank Transfer</option>
            </select>
          </Field>
          <Field label="Receipt ref"><Input value={form.receipt_ref} onChange={(v) => setForm({...form,receipt_ref:v})} placeholder="Optional"/></Field>

          {/* Receipt upload */}
          <Field label="Attach receipt (photo or PDF)" className="sm:col-span-2">
            <label className={`flex items-center gap-3 cursor-pointer rounded-lg border-2 border-dashed p-3 transition-colors ${receiptFile ? "border-accent bg-accent/5" : "border-border hover:border-accent"}`}>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={onReceiptChange}/>
              {receiptPreview === "pdf" ? (
                <div className="flex items-center gap-2 text-sm text-accent">
                  <FileText className="size-5"/>
                  <span>{receiptFile?.name}</span>
                </div>
              ) : receiptPreview ? (
                <div className="flex items-center gap-3">
                  <img src={receiptPreview} alt="Receipt preview" className="size-16 rounded object-cover border border-border"/>
                  <span className="text-sm text-accent">{receiptFile?.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Paperclip className="size-4"/>
                  <span>Tap to attach receipt — photo or PDF</span>
                </div>
              )}
            </label>
            {receiptFile && (
              <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(""); }}
                className="text-xs text-muted-foreground hover:text-danger mt-1">Remove</button>
            )}
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── INCOME ── */
function IncomeTab() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const branchId = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const { data, isLoading } = useQuery({
    queryKey:["income-list", branchId],
    queryFn: async () => (await supabase.from("income_records").select("*").eq("branch_id", branchId).order("income_date",{ascending:false})).data??[],
  });
  const totalIncome = (data??[]).reduce((s:number,r:any)=>s+Number(r.amount),0);
  const totalCommission = (data??[]).reduce((s:number,r:any)=>s+Number(r.commission_amount||0),0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Income" value={formatKES(totalIncome)} icon={<TrendingUp className="size-5"/>} tone="success"/>
        <StatCard label="PLA Commission" value={formatKES(totalCommission)} icon={<Receipt className="size-5"/>} tone="gold"/>
      </div>
      <PageCard title="Income Records" action={
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4"/>Add Income</button>
      }>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Description</th><th className="py-2 pr-3 text-right">Amount</th>
            <th className="py-2 pr-3 text-right">Commission %</th><th className="py-2 text-right">PLA Due</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(data??[]).map((r:any) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2.5 pr-3 text-xs text-muted-foreground">{r.income_date}</td>
                <td className="py-2.5 pr-3 capitalize">{r.category}</td>
                <td className="py-2.5 pr-3">{r.description}</td>
                <td className="py-2.5 pr-3 text-right font-semibold text-success">{formatKES(r.amount)}</td>
                <td className="py-2.5 pr-3 text-right text-muted-foreground">{r.commission_rate??0}%</td>
                <td className="py-2.5 text-right font-semibold text-accent">{formatKES(r.commission_amount??0)}</td>
              </tr>
            ))}
            {!isLoading && !data?.length && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No income recorded</td></tr>}
          </tbody>
        </table>
      </PageCard>
      {open && <IncomeForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({queryKey:["income-list"]}); }}/>}
    </div>
  );
}

function IncomeForm({ onClose, onSaved }:{ onClose:()=>void; onSaved:()=>void }) {
  const { user, activeBranch } = useAuth();
  // Always compute branch inside form — never rely on stale prop from parent
  const branch = (user?.role === "super_admin" || user?.role === "dice_admin")
    ? (activeBranch || user?.branch_id || "")
    : (user?.branch_id || "");
  const [form, setForm] = useState({ category:"school_fees", description:"", amount:"", commission_rate:"", income_date: new Date().toISOString().slice(0,10), payment_method:"bank_transfer", reference:"" });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.description || !form.amount) { toast.error("Description and amount are required"); return; }
    if (!branch) { toast.error("Branch not set — please refresh and try again", { duration: 8000 }); return; }
    setSaving(true);
    try {
      const amount = Number(form.amount);
      if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount greater than 0"); setSaving(false); return; }
      const rate = Number(form.commission_rate) || 0;
      const { error } = await supabase.from("income_records").insert({
        branch_id: branch,
        category: form.category,
        description: form.description.trim(),
        amount,
        commission_rate: rate,
        commission_amount: Math.round(amount * rate / 100 * 100) / 100,
        income_date: form.income_date,
        payment_method: form.payment_method,
        reference: form.reference.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      toast.success("Income recorded successfully");
      onSaved();
    } catch(e:any) { toast.error("Failed to save: " + (e.message ?? "Unknown error"), { duration: 8000 }); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-2">Record Income</h2>
        <div className="text-xs text-muted-foreground mb-3 px-1">
          Saving to: <span className="font-semibold text-accent">{branch === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy"}</span>
          {!branch && <span className="text-danger ml-1">⚠ Branch not detected — refresh page</span>}
        </div>
        <div className="space-y-3">
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({...form,category:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="school_fees">School Fees</option>
              <option value="commission">Commission</option>
              <option value="grants">Grants</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Description"><Input value={form.description} onChange={(v) => setForm({...form,description:v})}/></Field>
          <Field label="Amount (KES)"><Input type="number" value={form.amount} onChange={(v) => setForm({...form,amount:v})}/></Field>
          <Field label="PLA Commission %">
            <Input type="number" value={form.commission_rate} onChange={(v) => setForm({...form,commission_rate:v})} placeholder="e.g. 15"/>
          </Field>
          <div className="rounded-md bg-accent/10 border border-accent/20 px-3 py-2 text-sm">
            PLA commission: <span className="font-bold text-accent">{formatKES((Number(form.amount)||0) * (Number(form.commission_rate)||0) / 100)}</span>
          </div>
          <Field label="Date"><Input type="date" value={form.income_date} onChange={(v) => setForm({...form,income_date:v})}/></Field>
          <Field label="Reference"><Input value={form.reference} onChange={(v) => setForm({...form,reference:v})} placeholder="Invoice/receipt ref"/></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

// build: 1784478709
// deployed: 2026-07-20T09:40:53Z

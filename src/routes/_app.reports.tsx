import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, StatCard } from "@/components/app-shell";
import { formatKES, csvDownload } from "@/lib/pla";
import { Download, FileText, Wallet, GraduationCap, CalendarCheck } from "lucide-react";
import { startOfMonth, endOfMonth, formatISO, format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const COLORS = ["#d4a017", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

function ReportsPage() {
  const [tab, setTab] = useState<"finance" | "enrollment" | "attendance" | "expenditure" | "categories">("finance");
  const [from, setFrom] = useState(formatISO(startOfMonth(new Date()), { representation: "date" }));
  const [to, setTo] = useState(formatISO(endOfMonth(new Date()), { representation: "date" }));

  return (
    <div className="space-y-4">
      <PageCard title="Reports" subtitle="Generate insights and export data">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs"><span className="block mb-1 text-muted-foreground">From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm" /></label>
          <label className="text-xs"><span className="block mb-1 text-muted-foreground">To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm" /></label>
          <div className="flex gap-1 ml-auto">
            {(["finance", "enrollment", "attendance", "expenditure", "categories"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm capitalize rounded-md ${tab === t ? "bg-accent text-accent-foreground" : "bg-muted"}`}>{t}</button>
            ))}
          </div>
        </div>
      </PageCard>

      {tab === "finance" && <FinanceReport from={from} to={to} />}
      {tab === "enrollment" && <EnrollmentReport />}
      {tab === "attendance" && <AttendanceReport from={from} to={to} />}
      {tab === "expenditure" && <ExpenditureReportTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}

function FinanceReport({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["fin-report", from, to],
    queryFn: async () => {
      const { data: payments } = await supabase.from("payments").select("*,students(first_name,last_name,admission_number)").gte("payment_date", from).lte("payment_date", to);
      const total = (payments ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
      const byMethod: Record<string, number> = {};
      (payments ?? []).forEach((p: any) => { byMethod[p.payment_method] = (byMethod[p.payment_method] ?? 0) + Number(p.amount); });
      const byDay: Record<string, number> = {};
      (payments ?? []).forEach((p: any) => { byDay[p.payment_date] = (byDay[p.payment_date] ?? 0) + Number(p.amount); });
      return {
        payments: payments ?? [],
        total,
        byMethod: Object.entries(byMethod).map(([name, value]) => ({ name, value })),
        byDay: Object.entries(byDay).sort().map(([date, amount]) => ({ date: format(new Date(date), "dd MMM"), amount })),
      };
    },
  });

  function exportCsv() {
    csvDownload(`payments-${from}-to-${to}.csv`,
      (data?.payments ?? []).map((p: any) => ({
        Receipt: p.receipt_number, Date: p.payment_date,
        Student: `${p.students?.first_name} ${p.students?.last_name}`,
        Admission: p.students?.admission_number,
        Method: p.payment_method, Amount: p.amount, Notes: p.notes ?? "",
      })));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Collected" value={formatKES(data?.total ?? 0)} icon={<Wallet className="size-5" />} tone="gold" />
        <StatCard label="Transactions" value={data?.payments.length ?? 0} icon={<FileText className="size-5" />} />
        <StatCard label="Avg Payment" value={data?.payments.length ? formatKES(data.total / data.payments.length) : "—"} icon={<Wallet className="size-5" />} tone="success" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <PageCard title="Daily Collections" subtitle="Trend over period">
          <div className="h-60 lg:col-span-2">
            <ResponsiveContainer>
              <BarChart data={data?.byDay ?? []}>
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} /><YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatKES(Number(v))} contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} />
                <Bar dataKey="amount" fill="#d4a017" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PageCard>
        <PageCard title="By Method">
          <div className="h-60">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data?.byMethod ?? []} dataKey="value" nameKey="name" outerRadius={80} label={(e: any) => e.name}>
                  {(data?.byMethod ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => formatKES(Number(v))} contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </PageCard>
      </div>
      <PageCard title="Payments" action={<button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Download className="size-4" /> Export CSV</button>}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Receipt</th><th>Date</th><th>Student</th><th>Method</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {(data?.payments ?? []).map((p: any) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-2 font-mono text-xs">{p.receipt_number}</td>
                <td className="py-2">{format(new Date(p.payment_date), "dd MMM yyyy")}</td>
                <td className="py-2">{p.students?.first_name} {p.students?.last_name}</td>
                <td className="py-2">{p.payment_method}</td>
                <td className="py-2 text-right font-semibold">{formatKES(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageCard>
    </div>
  );
}

function EnrollmentReport() {
  const { data } = useQuery({
    queryKey: ["enrol-report"],
    queryFn: async () => {
      const { data: students } = await supabase.from("students").select("status,gender,skill_level,enrollment_date");
      const byStatus: Record<string, number> = {}, byLevel: Record<string, number> = {}, byMonth: Record<string, number> = {};
      (students ?? []).forEach((s: any) => {
        byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
        byLevel[s.skill_level || "—"] = (byLevel[s.skill_level || "—"] ?? 0) + 1;
        if (s.enrollment_date) { const k = s.enrollment_date.slice(0, 7); byMonth[k] = (byMonth[k] ?? 0) + 1; }
      });
      return {
        students: students ?? [],
        byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
        byLevel: Object.entries(byLevel).map(([name, value]) => ({ name, value })),
        byMonth: Object.entries(byMonth).sort().map(([month, count]) => ({ month, count })),
      };
    },
  });
  function exportCsv() {
    csvDownload("students.csv", (data?.students ?? []).map((s: any, i) => ({ Row: i + 1, ...s })));
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Total Students" value={data?.students.length ?? 0} icon={<GraduationCap className="size-5" />} />
        <StatCard label="Active" value={data?.byStatus.find((s) => s.name === "active")?.value ?? 0} icon={<GraduationCap className="size-5" />} tone="success" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <PageCard title="By Level"><div className="h-56"><ResponsiveContainer><PieChart><Pie data={data?.byLevel ?? []} dataKey="value" nameKey="name" outerRadius={80} label>{(data?.byLevel ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} /></PieChart></ResponsiveContainer></div></PageCard>
        <PageCard title="By Status"><div className="h-56"><ResponsiveContainer><PieChart><Pie data={data?.byStatus ?? []} dataKey="value" nameKey="name" outerRadius={80} label>{(data?.byStatus ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} /></PieChart></ResponsiveContainer></div></PageCard>
        <PageCard title="Enrollments / month">
          <div className="h-56"><ResponsiveContainer><BarChart data={data?.byMonth ?? []}><XAxis dataKey="month" stroke="#9ca3af" fontSize={11} /><YAxis stroke="#9ca3af" fontSize={11} /><Tooltip contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} /><Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
        </PageCard>
      </div>
      <PageCard title="Roster" action={<button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Download className="size-4" /> Export CSV</button>}>
        <div className="text-sm text-muted-foreground">{data?.students.length ?? 0} student records ready to export.</div>
      </PageCard>
    </div>
  );
}

function AttendanceReport({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["att-report", from, to],
    queryFn: async () => {
      const { data: records } = await supabase.from("attendance_records").select("status,session_id,sessions!inner(session_date,courses(name))").gte("sessions.session_date", from).lte("sessions.session_date", to);
      const byStatus: Record<string, number> = {};
      (records ?? []).forEach((r: any) => { byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; });
      const byCourse: Record<string, { present: number; total: number }> = {};
      (records ?? []).forEach((r: any) => {
        const c = r.sessions?.courses?.name ?? "—";
        byCourse[c] ??= { present: 0, total: 0 };
        byCourse[c].total++;
        if (r.status === "present") byCourse[c].present++;
      });
      return {
        records: records ?? [],
        byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
        byCourse: Object.entries(byCourse).map(([course, c]) => ({ course, rate: Math.round((c.present / c.total) * 100) })),
      };
    },
  });

  function exportCsv() {
    csvDownload(`attendance-${from}-to-${to}.csv`, (data?.records ?? []).map((r: any) => ({
      Date: r.sessions?.session_date, Course: r.sessions?.courses?.name, Status: r.status,
    })));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Records" value={data?.records.length ?? 0} icon={<CalendarCheck className="size-5" />} />
        <StatCard label="Present" value={data?.byStatus.find((s) => s.name === "present")?.value ?? 0} icon={<CalendarCheck className="size-5" />} tone="success" />
        <StatCard label="Absent" value={data?.byStatus.find((s) => s.name === "absent")?.value ?? 0} icon={<CalendarCheck className="size-5" />} tone="danger" />
      </div>
      <PageCard title="Attendance Rate by Course" action={<button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Download className="size-4" /> Export CSV</button>}>
        <div className="h-64"><ResponsiveContainer><BarChart data={data?.byCourse ?? []}><XAxis dataKey="course" stroke="#9ca3af" fontSize={11} /><YAxis stroke="#9ca3af" fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} /><Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} /><Bar dataKey="rate" fill="#10b981" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
      </PageCard>
    </div>
  );
}

function ExpenditureReportTab() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const monthStart = `${year}-${String(month).padStart(2,"0")}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().slice(0,10);

  const { data: expenditures } = useQuery({
    queryKey: ["exp-report", month, year, user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("expenditures")
        .select("*")
        .gte("expense_date", monthStart)
        .lte("expense_date", monthEnd)
        .order("expense_date");
      if (user?.role !== "super_admin") q = q.eq("branch_id", user?.branch_id ?? "");
      return (await q).data ?? [];
    },
  });

  const byCategory = (expenditures ?? []).reduce((acc: any, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {});
  const totalExp = (expenditures ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-background border border-input rounded-md px-2 py-1.5 text-sm">
          {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-background border border-input rounded-md px-2 py-1.5 text-sm">
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Expenditure</p>
          <p className="text-2xl font-bold text-danger mt-1">{formatKES(totalExp)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Transactions</p>
          <p className="text-2xl font-bold mt-1">{expenditures?.length ?? 0}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">By Category</h3>
        <div className="space-y-2">
          {Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1]).map(([cat, amt]: any) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-sm capitalize flex-1">{cat.replace(/_/g," ")}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-2 bg-danger rounded-full" style={{ width: `${totalExp ? (amt/totalExp)*100 : 0}%` }}/>
              </div>
              <span className="text-sm font-medium text-danger w-24 text-right">{formatKES(amt)}</span>
            </div>
          ))}
          {!Object.keys(byCategory).length && <p className="text-sm text-muted-foreground">No expenditures this period</p>}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <th className="p-3">Date</th><th className="p-3">Category</th><th className="p-3">Description</th><th className="p-3 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {(expenditures ?? []).map((e: any) => (
              <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 text-xs text-muted-foreground">{e.expense_date}</td>
                <td className="p-3 capitalize text-xs">{(e.category||"").replace(/_/g," ")}</td>
                <td className="p-3">{e.description}</td>
                <td className="p-3 text-right text-danger font-medium">{formatKES(e.amount)}</td>
              </tr>
            ))}
            {!expenditures?.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No expenditures this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoriesTab() {
  const { user } = useAuth();
  const { data: programs } = useQuery({
    queryKey: ["programs-cat", user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("programs").select("id,name,category,billing_cycle,monthly_fee,term_fee,status");
      if (user?.role !== "super_admin") q = q.eq("branch_id", user?.branch_id ?? "");
      return (await q).data ?? [];
    },
  });
  const { data: enrollments } = useQuery({
    queryKey: ["enroll-cat", user?.branch_id],
    queryFn: async () => {
      const { data: courses } = await supabase.from("courses").select("id,program_id,name,branch_id");
      const { data: enroll } = await supabase.from("course_enrollments").select("course_id,status");
      return { courses: courses ?? [], enroll: enroll ?? [] };
    },
  });

  const byCategory = (programs ?? []).reduce((acc: any, p: any) => {
    const cat = p.category || "general";
    if (!acc[cat]) acc[cat] = { programs: 0, students: 0 };
    acc[cat].programs++;
    // Count enrollments for courses in this program
    const courseIds = (enrollments?.courses ?? []).filter((c: any) => c.program_id === p.id).map((c: any) => c.id);
    acc[cat].students += (enrollments?.enroll ?? []).filter((e: any) => courseIds.includes(e.course_id) && e.status === "active").length;
    return acc;
  }, {} as Record<string, { programs: number; students: number }>);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(byCategory).map(([cat, data]: any) => (
          <div key={cat} className="rounded-xl border border-border bg-card p-4">
            <div className="font-semibold capitalize mb-2">{cat.replace(/_/g," ")}</div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{data.programs} programs</span>
              <span>{data.students} students</span>
            </div>
          </div>
        ))}
        {!Object.keys(byCategory).length && (
          <div className="sm:col-span-3 text-center py-8 text-muted-foreground">No programs yet — add programs to see category breakdown</div>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <th className="p-3">Program</th><th className="p-3">Category</th>
            <th className="p-3">Billing</th><th className="p-3 text-right">Fee</th>
          </tr></thead>
          <tbody>
            {(programs ?? []).map((p: any) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 capitalize text-xs">{(p.category||"general").replace(/_/g," ")}</td>
                <td className="p-3 text-xs capitalize">{p.billing_cycle}</td>
                <td className="p-3 text-right">{formatKES(p.billing_cycle==="termly" ? p.term_fee : p.monthly_fee)}</td>
              </tr>
            ))}
            {!programs?.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No programs yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

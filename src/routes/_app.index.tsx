import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatKES, getStatusColor } from "@/lib/pla";
import { StatCard, PageCard, Badge } from "@/components/app-shell";
import { Users, GraduationCap, Wallet, AlertCircle, CalendarCheck, BookOpen, TrendingUp, Receipt } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, formatISO } from "date-fns";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  switch (user.role) {
    case "super_admin": return <AdminDash />;
    case "finance_admin": return <FinanceDash />;
    case "teacher": return <TeacherDash />;
    case "parent": return <ParentDash />;
    case "student": return <StudentDash />;
  }
  return null;
}

function AdminDash() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const monthStart = formatISO(startOfMonth(new Date()), { representation: "date" });
      const today = formatISO(new Date(), { representation: "date" });
      const [students, courses, payments, accounts, attendance, enrollments] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payments").select("amount,payment_date").gte("payment_date", monthStart),
        supabase.from("student_accounts").select("total_outstanding"),
        supabase.from("attendance_records").select("status,sessions!inner(session_date)").gte("sessions.session_date", today),
        supabase.from("students").select("id", { count: "exact", head: true }).gte("enrollment_date", monthStart),
      ]);
      const revenue = (payments.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
      const arrears = (accounts.data ?? []).reduce((s, a: any) => s + Number(a.total_outstanding), 0);
      const present = (attendance.data ?? []).filter((r: any) => r.status === "present").length;
      const rate = attendance.data && attendance.data.length ? Math.round((present / attendance.data.length) * 100) : 0;
      return {
        students: students.count ?? 0,
        courses: courses.count ?? 0,
        revenue, arrears, attendanceRate: rate,
        newEnrollments: enrollments.count ?? 0,
      };
    },
  });

  const chartData = useQuery({
    queryKey: ["admin-revenue-chart"],
    queryFn: async () => {
      const out: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const start = formatISO(startOfMonth(d), { representation: "date" });
        const end = formatISO(endOfMonth(d), { representation: "date" });
        const { data } = await supabase.from("payments").select("amount").gte("payment_date", start).lte("payment_date", end);
        out.push({ month: format(d, "MMM"), revenue: (data ?? []).reduce((s, p: any) => s + Number(p.amount), 0) });
      }
      return out;
    },
  });

  const attendanceData = stats.data ? [
    { name: "Present", value: stats.data.attendanceRate },
    { name: "Absent", value: 100 - stats.data.attendanceRate },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active Students" value={stats.data?.students ?? "—"} icon={<GraduationCap className="size-5" />} />
        <StatCard label="Active Courses" value={stats.data?.courses ?? "—"} icon={<BookOpen className="size-5" />} />
        <StatCard label="Revenue (Month)" value={stats.data ? formatKES(stats.data.revenue) : "—"} icon={<Wallet className="size-5" />} tone="gold" />
        <StatCard label="Outstanding" value={stats.data ? formatKES(stats.data.arrears) : "—"} icon={<AlertCircle className="size-5" />} tone="danger" />
        <StatCard label="Attendance Today" value={stats.data ? `${stats.data.attendanceRate}%` : "—"} icon={<CalendarCheck className="size-5" />} tone="success" />
        <StatCard label="New (Month)" value={stats.data?.newEnrollments ?? "—"} icon={<TrendingUp className="size-5" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PageCard title="Revenue — Last 6 months" subtitle="Monthly collected in KES">
          <div className="h-64 lg:col-span-2">
            <ResponsiveContainer>
              <BarChart data={chartData.data ?? []}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} formatter={(v: any) => formatKES(Number(v))} />
                <Bar dataKey="revenue" fill="#d4a017" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PageCard>
        <PageCard title="Attendance Today" subtitle="Live presence breakdown">
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={attendanceData} dataKey="value" innerRadius={56} outerRadius={88} paddingAngle={3}>
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Legend />
                <Tooltip contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </PageCard>
      </div>

      <RecentPaymentsCard />
    </div>
  );
}

function FinanceDash() {
  const stats = useQuery({
    queryKey: ["finance-stats"],
    queryFn: async () => {
      const today = formatISO(new Date(), { representation: "date" });
      const monthStart = formatISO(startOfMonth(new Date()), { representation: "date" });
      const [todayPay, monthPay, arrears, overdue] = await Promise.all([
        supabase.from("payments").select("amount").eq("payment_date", today),
        supabase.from("payments").select("amount").gte("payment_date", monthStart),
        supabase.from("student_accounts").select("total_outstanding"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
      ]);
      return {
        todayCollection: (todayPay.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0),
        monthCollection: (monthPay.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0),
        arrears: (arrears.data ?? []).reduce((s, a: any) => s + Number(a.total_outstanding), 0),
        overdue: overdue.count ?? 0,
      };
    },
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's Collection" value={stats.data ? formatKES(stats.data.todayCollection) : "—"} icon={<Receipt className="size-5" />} tone="gold" />
        <StatCard label="Month-to-date" value={stats.data ? formatKES(stats.data.monthCollection) : "—"} icon={<Wallet className="size-5" />} tone="success" />
        <StatCard label="Total Arrears" value={stats.data ? formatKES(stats.data.arrears) : "—"} icon={<AlertCircle className="size-5" />} tone="danger" />
        <StatCard label="Overdue Invoices" value={stats.data?.overdue ?? "—"} icon={<AlertCircle className="size-5" />} tone="warning" />
      </div>
      <RecentPaymentsCard />
    </div>
  );
}

function RecentPaymentsCard() {
  const { data } = useQuery({
    queryKey: ["recent-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,receipt_number,amount,payment_method,payment_date,students(first_name,last_name)")
        .order("payment_date", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });
  return (
    <PageCard title="Recent Payments" subtitle="Last 10 receipts">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-2">Receipt</th><th className="py-2 pr-2">Student</th><th className="py-2 pr-2">Method</th><th className="py-2 pr-2">Date</th><th className="py-2 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((p: any) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-2.5 pr-2 font-mono text-xs">{p.receipt_number}</td>
                <td className="py-2.5 pr-2">{p.students?.first_name} {p.students?.last_name}</td>
                <td className="py-2.5 pr-2"><Badge className={getStatusColor(p.payment_method)}>{p.payment_method}</Badge></td>
                <td className="py-2.5 pr-2 text-muted-foreground">{format(new Date(p.payment_date), "dd MMM yyyy")}</td>
                <td className="py-2.5 text-right font-semibold">{formatKES(p.amount)}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No payments yet</td></tr>}
          </tbody>
        </table>
      </div>
    </PageCard>
  );
}

function TeacherDash() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["teacher-today", user?.id],
    queryFn: async () => {
      const today = formatISO(new Date(), { representation: "date" });
      const { data } = await supabase
        .from("sessions")
        .select("id,session_date,topic,status,courses!inner(name,start_time,end_time,room,instructor_id,instructors(linked_user_id))")
        .eq("session_date", today)
        .order("session_date");
      return (data ?? []).filter((s: any) => s.courses?.instructors?.linked_user_id === user?.id || true);
    },
  });
  return (
    <div className="space-y-6">
      <PageCard title="Today's Sessions" subtitle={format(new Date(), "EEEE, dd MMM yyyy")}>
        <div className="grid gap-3">
          {(data ?? []).map((s: any) => (
            <div key={s.id} className="border border-border rounded-lg p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{s.courses?.name}</div>
                <div className="text-sm text-muted-foreground">
                  {s.courses?.start_time?.slice(0, 5)} – {s.courses?.end_time?.slice(0, 5)} · Room {s.courses?.room || "—"}
                </div>
                {s.topic && <div className="text-xs mt-1 text-accent">{s.topic}</div>}
              </div>
              <a href={`/attendance?session=${s.id}`} className="rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">Mark Attendance</a>
            </div>
          ))}
          {!data?.length && <div className="text-center text-muted-foreground py-8">No sessions scheduled today.</div>}
        </div>
      </PageCard>
    </div>
  );
}

function ParentDash() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["parent-children", user?.linked_entity_id],
    queryFn: async () => {
      if (!user?.linked_entity_id) return [];
      const { data: sp } = await supabase
        .from("student_parents")
        .select("student_id,students(id,admission_number,first_name,last_name,skill_level,status)")
        .eq("parent_id", user.linked_entity_id);
      const studentIds = (sp ?? []).map((s: any) => s.student_id);
      const accounts = studentIds.length
        ? (await supabase.from("student_accounts").select("student_id,total_outstanding").in("student_id", studentIds)).data ?? []
        : [];
      return (sp ?? []).map((row: any) => ({
        ...row.students,
        outstanding: accounts.find((a: any) => a.student_id === row.student_id)?.total_outstanding ?? 0,
      }));
    },
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((c: any) => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-12 rounded-full bg-primary flex items-center justify-center font-semibold">{c.first_name?.[0]}{c.last_name?.[0]}</div>
              <div>
                <div className="font-semibold">{c.first_name} {c.last_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{c.admission_number}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-xs text-muted-foreground">Level</div><div>{c.skill_level || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Status</div><Badge className={getStatusColor(c.status)}>{c.status}</Badge></div>
              <div className="col-span-2 pt-2 border-t border-border"><div className="text-xs text-muted-foreground">Balance Due</div><div className="text-lg font-bold text-accent">{formatKES(c.outstanding)}</div></div>
            </div>
          </div>
        ))}
        {!data?.length && <div className="md:col-span-3 text-center text-muted-foreground py-12 bg-card border border-border rounded-xl">No children linked to your account.</div>}
      </div>
    </div>
  );
}

function StudentDash() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["student-today", user?.linked_entity_id],
    queryFn: async () => {
      if (!user?.linked_entity_id) return { sessions: [], outstanding: 0 };
      const today = formatISO(new Date(), { representation: "date" });
      const { data: enr } = await supabase.from("course_enrollments").select("course_id").eq("student_id", user.linked_entity_id);
      const cids = (enr ?? []).map((e: any) => e.course_id);
      const sessions = cids.length
        ? (await supabase.from("sessions").select("id,session_date,topic,courses(name,start_time,end_time,room)").in("course_id", cids).eq("session_date", today)).data ?? []
        : [];
      const acct = (await supabase.from("student_accounts").select("total_outstanding").eq("student_id", user.linked_entity_id).maybeSingle()).data;
      return { sessions, outstanding: acct?.total_outstanding ?? 0 };
    },
  });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="Sessions Today" value={data?.sessions.length ?? 0} icon={<CalendarCheck className="size-5" />} />
        <StatCard label="Outstanding Balance" value={formatKES(data?.outstanding ?? 0)} icon={<Wallet className="size-5" />} tone="gold" />
      </div>
      <PageCard title="My Sessions Today">
        <div className="space-y-2">
          {(data?.sessions ?? []).map((s: any) => (
            <div key={s.id} className="border border-border rounded-lg p-4">
              <div className="font-semibold">{s.courses?.name}</div>
              <div className="text-sm text-muted-foreground">{s.courses?.start_time?.slice(0, 5)} – {s.courses?.end_time?.slice(0, 5)} · Room {s.courses?.room || "—"}</div>
              {s.topic && <div className="text-xs text-accent mt-1">{s.topic}</div>}
            </div>
          ))}
          {!data?.sessions.length && <div className="text-center py-6 text-muted-foreground">No classes scheduled today.</div>}
        </div>
      </PageCard>
    </div>
  );
}

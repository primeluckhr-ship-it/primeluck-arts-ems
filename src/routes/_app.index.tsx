import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatKES, getStatusColor } from "@/lib/pla";
import { StatCard, PageCard, Badge } from "@/components/app-shell";
import { Users, GraduationCap, Wallet, AlertCircle, CalendarCheck, BookOpen, TrendingUp, Receipt, Building2, Target, FileText, PlusCircle } from "lucide-react";
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
    case "dice_admin": return <DiceAdminDash />;
  }
  return null;
}

function AdminDash() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const branch = user?.branch_id ?? "";

  // Apply branch filter for non-super-admin users
  function br<T extends object>(q: T): T {
    return (isSuper ? q : (q as any).eq("branch_id", branch)) as T;
  }

  const stats = useQuery({
    queryKey: ["admin-stats", branch, user?.role],
    queryFn: async () => {
      const monthStart = formatISO(startOfMonth(new Date()), { representation: "date" });
      const today = formatISO(new Date(), { representation: "date" });
      const [students, courses, payments, accounts, attendance, enrollments, studentTypes] = await Promise.all([
        br(supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active")),
        br(supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "active")),
        supabase.from("payments").select("amount,payment_date").gte("payment_date", monthStart),
        supabase.from("student_accounts").select("total_outstanding"),
        supabase.from("attendance_records").select("status,sessions!inner(session_date)").gte("sessions.session_date", today),
        br(supabase.from("students").select("id", { count: "exact", head: true }).gte("enrollment_date", monthStart)),
        br(supabase.from("students").select("student_type").eq("status","active")),
      ]);
      const revenue = (payments.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
      const arrears = (accounts.data ?? []).reduce((s, a: any) => s + Number(a.total_outstanding), 0);
      const present = (attendance.data ?? []).filter((r: any) => r.status === "present").length;
      const rate = attendance.data && attendance.data.length ? Math.round((present / attendance.data.length) * 100) : 0;
      const types = { junior:0, teen:0, adult:0, institution:0 };
      (studentTypes.data??[]).forEach((s:any) => { if(types[s.student_type as keyof typeof types]!==undefined) types[s.student_type as keyof typeof types]++; });
      return {
        students: students.count ?? 0,
        courses: courses.count ?? 0,
        revenue, arrears, attendanceRate: rate,
        newEnrollments: enrollments.count ?? 0,
        types,
      };
    },
  });

  const chartData = useQuery({
    queryKey: ["admin-revenue-chart", branch, user?.role],
    queryFn: async () => {
      const out: { month: string; revenue: number; expenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const start = formatISO(startOfMonth(d), { representation: "date" });
        const end = formatISO(endOfMonth(d), { representation: "date" });
        const [rev, exp] = await Promise.all([
          isSuper ? supabase.from("payments").select("amount").gte("payment_date", start).lte("payment_date", end)
            : supabase.from("payments").select("amount").gte("payment_date", start).lte("payment_date", end).eq("branch_id", branch),
          isSuper ? supabase.from("expenditures").select("amount").gte("expense_date", start).lte("expense_date", end)
            : supabase.from("expenditures").select("amount").gte("expense_date", start).lte("expense_date", end).eq("branch_id", branch),
        ]);
        out.push({
          month: format(d, "MMM"),
          revenue: (rev.data ?? []).reduce((s, p: any) => s + Number(p.amount), 0),
          expenses: (exp.data ?? []).reduce((s, e: any) => s + Number(e.amount), 0),
        });
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

      {/* Student type breakdown */}
      {stats.data?.types && (
        <div className="grid grid-cols-4 gap-2">
          {([
            { type:"junior",      label:"Juniors",      cls:"border-blue-500/30 text-blue-400 bg-blue-500/10" },
            { type:"teen",        label:"Teens",        cls:"border-purple-500/30 text-purple-400 bg-purple-500/10" },
            { type:"adult",       label:"Adults",       cls:"border-success/30 text-success bg-success/10" },
            { type:"institution", label:"Institutions", cls:"border-orange-500/30 text-orange-400 bg-orange-500/10" },
          ]).map((s) => (
            <div key={s.type} className={`rounded-xl border p-3 text-center ${s.cls}`}>
              <div className="text-xl font-bold">{stats.data!.types[s.type as keyof typeof stats.data.types]}</div>
              <div className="text-xs font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <PageCard title="Revenue — Last 6 months" subtitle="Monthly collected in KES">
          <div className="h-64 lg:col-span-2">
            <ResponsiveContainer>
              <BarChart data={chartData.data ?? []}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ background: "#1a1035", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }} formatter={(v: any) => formatKES(Number(v))} />
                <Bar dataKey="revenue" fill="#d4a017" radius={[6, 6, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="#ef4444" radius={[6, 6, 0, 0]} name="Expenses" />
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

/* ═══════════════════════════════════════════════
   DICE ARTS ADMIN DASHBOARD
   ═══════════════════════════════════════════════ */
function DiceAdminDash() {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const BRANCH = "dice-arts-nairobi";

  const { data: stats } = useQuery({
    queryKey: ["dice-stats"],
    queryFn: async () => {
      const [schools, students, income, expenditure, projects, lessons, reports] = await Promise.all([
        supabase.from("dice_institutions").select("id,name,term_fee,commission_rate", { count: "exact" }).eq("branch_id", BRANCH).eq("is_active", true),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("branch_id", BRANCH).eq("status", "active"),
        supabase.from("income_records").select("amount,commission_amount").eq("branch_id", BRANCH),
        supabase.from("expenditures").select("amount").eq("branch_id", BRANCH),
        supabase.from("projects").select("id,status", { count: "exact" }).eq("branch_id", BRANCH),
        supabase.from("lesson_plans").select("id,title,lesson_date,courses(name)").eq("branch_id", BRANCH).gte("lesson_date", today).order("lesson_date").limit(5),
        supabase.from("student_progress_reports").select("id", { count: "exact", head: true }).eq("branch_id", BRANCH),
      ]);

      const totalIncome = (income.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const totalComm   = (income.data ?? []).reduce((s: number, r: any) => s + Number(r.commission_amount ?? 0), 0);
      const totalExp    = (expenditure.data ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);

      // Expected term fees from partner schools
      const termRevenue = (schools.data ?? []).reduce((s: number, i: any) => s + Number(i.term_fee ?? 0), 0);
      const termComm    = (schools.data ?? []).reduce((s: number, i: any) => s + Number(i.term_fee ?? 0) * Number(i.commission_rate ?? 0) / 100, 0);

      const activeProjects = (projects.data ?? []).filter((p: any) => p.status === "active").length;

      return {
        schools: schools.count ?? 0,
        students: students.count ?? 0,
        totalIncome, totalComm, totalExp,
        termRevenue, termComm,
        activeProjects,
        upcomingLessons: lessons.data ?? [],
        reportsCount: reports.count ?? 0,
        net: totalIncome - totalExp,
      };
    },
  });

  const { data: recentReports } = useQuery({
    queryKey: ["dice-recent-reports"],
    queryFn: async () => (await supabase.from("student_progress_reports")
      .select("*,students(first_name,last_name),courses(name)")
      .eq("branch_id", BRANCH)
      .order("report_date", { ascending: false })
      .limit(4)).data ?? [],
  });

  const { data: recentProjects } = useQuery({
    queryKey: ["dice-recent-projects"],
    queryFn: async () => (await supabase.from("projects")
      .select("*,dice_institutions(name)")
      .eq("branch_id", BRANCH)
      .in("status", ["active","planning"])
      .order("start_date")
      .limit(4)).data ?? [],
  });

  const GRADE_DOT: Record<string, string> = {
    "Excellent": "bg-success", "Good": "bg-blue-400",
    "Satisfactory": "bg-warning", "Needs Improvement": "bg-danger",
  };
  const PROJ_STATUS: Record<string, string> = {
    planning: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    active:   "bg-success/15 text-success border-success/30",
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/10 via-card to-card p-5 flex items-center gap-4">
        <div className="size-14 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <BookOpen className="size-7 text-accent"/>
        </div>
        <div>
          <h1 className="text-xl font-bold">Dice Arts Academy</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")} · Inspiring Creativity
          </p>
        </div>
        <div className="ml-auto hidden sm:flex gap-2">
          <QuickAction href="/lessons"   icon={<BookOpen className="size-4"/>}   label="New Lesson"/>
          <QuickAction href="/projects"  icon={<Target className="size-4"/>}     label="New Project"/>
          <QuickAction href="/finance"   icon={<Receipt className="size-4"/>}    label="Record Income"/>
        </div>
      </div>

      {/* Key Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Partner Schools"    value={stats?.schools ?? 0}              icon={<Building2 className="size-5"/>}  />
        <StatCard label="Active Students"    value={stats?.students ?? 0}             icon={<GraduationCap className="size-5"/>} />
        <StatCard label="Term Revenue"       value={formatKES(stats?.termRevenue??0)} icon={<TrendingUp className="size-5"/>}  tone="success" />
        <StatCard label="PLA Commission"     value={formatKES(stats?.termComm??0)}    icon={<Wallet className="size-5"/>}      tone="gold" />
      </div>

      {/* Financial Overview */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Income</div>
          <div className="text-2xl font-bold text-success">{formatKES(stats?.totalIncome??0)}</div>
        </div>
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Expenditure</div>
          <div className="text-2xl font-bold text-danger">{formatKES(stats?.totalExp??0)}</div>
        </div>
        <div className={`rounded-xl border p-4 text-center ${(stats?.net??0)>=0 ? "border-accent/30 bg-accent/5" : "border-danger/30 bg-danger/5"}`}>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Position</div>
          <div className={`text-2xl font-bold ${(stats?.net??0)>=0 ? "text-accent" : "text-danger"}`}>{formatKES(Math.abs(stats?.net??0))}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{(stats?.net??0)>=0 ? "surplus" : "deficit"}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Upcoming Lessons */}
        <PageCard title="Upcoming Lessons" subtitle="Next scheduled lesson plans">
          <div className="space-y-2">
            {(stats?.upcomingLessons ?? []).map((l: any) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="size-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <BookOpen className="size-4 text-accent"/>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{l.title}</div>
                  <div className="text-xs text-muted-foreground">{l.courses?.name} · {l.lesson_date}</div>
                </div>
                <div className={`size-2 rounded-full shrink-0 ${l.lesson_date === today ? "bg-accent" : "bg-muted-foreground/40"}`}/>
              </div>
            ))}
            {!stats?.upcomingLessons?.length && (
              <p className="py-4 text-center text-sm text-muted-foreground">No upcoming lessons scheduled</p>
            )}
          </div>
        </PageCard>

        {/* Active Projects */}
        <PageCard title="Active Projects" subtitle={`${stats?.activeProjects ?? 0} in progress`}>
          <div className="space-y-2">
            {(recentProjects ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="size-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Target className="size-4 text-accent"/>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.dice_institutions?.name ?? "General"} · {p.start_date ?? "TBD"}
                  </div>
                </div>
                <Badge className={PROJ_STATUS[p.status] ?? ""}>{p.status}</Badge>
              </div>
            ))}
            {!recentProjects?.length && (
              <p className="py-4 text-center text-sm text-muted-foreground">No active projects</p>
            )}
          </div>
        </PageCard>

        {/* Recent Progress Reports */}
        <PageCard title="Recent Progress Reports" subtitle={`${stats?.reportsCount ?? 0} total reports`}>
          <div className="space-y-2">
            {(recentReports ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className={`size-3 rounded-full shrink-0 ${GRADE_DOT[r.overall_grade] ?? "bg-muted"}`}/>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">
                    {r.students?.first_name} {r.students?.last_name}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.courses?.name} · {r.report_date}</div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{r.overall_grade}</span>
              </div>
            ))}
            {!recentReports?.length && (
              <p className="py-4 text-center text-sm text-muted-foreground">No reports created yet</p>
            )}
          </div>
        </PageCard>

        {/* Quick Actions */}
        <PageCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            {[
              { href:"/lessons",           icon:<BookOpen className="size-5"/>,     label:"Lesson Plan",     sub:"Create & schedule" },
              { href:"/projects",          icon:<Target className="size-5"/>,       label:"New Project",     sub:"Track events" },
              { href:"/dice-institutions", icon:<Building2 className="size-5"/>,    label:"Partner Schools", sub:"Manage institutions" },
              { href:"/finance",           icon:<Receipt className="size-5"/>,      label:"Finance",         sub:"Income & expenses" },
              { href:"/attendance",        icon:<CalendarCheck className="size-5"/>,label:"Attendance",      sub:"Mark sessions" },
              { href:"/lessons",           icon:<FileText className="size-5"/>,     label:"Progress Report", sub:"Share with parents" },
            ].map((a) => (
              <a key={a.label} href={a.href}
                className="flex items-center gap-3 rounded-xl border border-border hover:border-accent/50 bg-background hover:bg-accent/5 p-3 transition-all group">
                <div className="size-9 rounded-lg bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center text-accent shrink-0 transition-colors">
                  {a.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.sub}</div>
                </div>
              </a>
            ))}
          </div>
        </PageCard>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-colors">
      {icon}{label}
    </a>
  );
}

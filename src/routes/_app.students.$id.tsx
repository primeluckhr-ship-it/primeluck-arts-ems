import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES, getStatusColor } from "@/lib/pla";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/students/$id")({
  component: StudentDetail,
});

function StudentDetail() {
  const { id } = useParams({ from: "/_app/students/$id" });
  const [tab, setTab] = useState<"overview" | "attendance" | "finance" | "portfolio" | "assessments" | "notes">("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: async () => {
      const [{ data: student }, { data: account }, { data: enrollments }, { data: attendance }, { data: invoices }, { data: payments }, { data: artwork }, { data: assess }, { data: parents }] = await Promise.all([
        supabase.from("students").select("*").eq("id", id).maybeSingle(),
        supabase.from("student_accounts").select("*").eq("student_id", id).maybeSingle(),
        supabase.from("course_enrollments").select("courses(name,room,start_time,end_time,programs(name))").eq("student_id", id),
        supabase.from("attendance_records").select("status,sessions(session_date,courses(name))").eq("student_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("invoices").select("*").eq("student_id", id).order("issue_date", { ascending: false }),
        supabase.from("payments").select("*").eq("student_id", id).order("payment_date", { ascending: false }),
        supabase.from("artwork_portfolio").select("*").eq("student_id", id).order("created_at", { ascending: false }),
        supabase.from("assessments").select("*").eq("student_id", id).order("assessment_date", { ascending: false }),
        supabase.from("student_parents").select("is_primary,parents(first_name,last_name,phone,email,whatsapp)").eq("student_id", id),
      ]);
      return { student, account, enrollments: enrollments ?? [], attendance: attendance ?? [], invoices: invoices ?? [], payments: payments ?? [], artwork: artwork ?? [], assess: assess ?? [], parents: parents ?? [] };
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data?.student) return <div>Student not found.</div>;
  const s = data.student;

  return (
    <div className="space-y-4">
      <Link to="/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back</Link>
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col sm:flex-row items-start gap-5">
        <div className="size-20 rounded-full bg-primary flex items-center justify-center text-2xl font-bold">{s.first_name?.[0]}{s.last_name?.[0]}</div>
        <div className="flex-1">
          <div className="text-2xl font-bold">{s.first_name} {s.last_name}</div>
          <div className="text-sm text-muted-foreground font-mono">{s.admission_number}</div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge className={getStatusColor(s.status)}>{s.status}</Badge>
            <Badge className="bg-muted text-foreground border-border">{s.skill_level}</Badge>
            {s.gender && <Badge className="bg-muted text-foreground border-border">{s.gender}</Badge>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="text-2xl font-bold text-accent">{formatKES(data.account?.total_outstanding ?? 0)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(["overview", "attendance", "finance", "portfolio", "assessments", "notes"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm capitalize border-b-2 ${tab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <PageCard title="Profile">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info l="DOB" v={s.date_of_birth ? format(new Date(s.date_of_birth), "dd MMM yyyy") : "—"} />
              <Info l="School" v={s.school || "—"} />
              <Info l="Grade" v={s.grade || "—"} />
              <Info l="Enrollment" v={s.enrollment_date ? format(new Date(s.enrollment_date), "dd MMM yyyy") : "—"} />
              <Info l="Emergency contact" v={s.emergency_contact || "—"} />
            </dl>
          </PageCard>
          <PageCard title="Parents">
            {data.parents.length ? data.parents.map((p: any, i: number) => (
              <div key={i} className="border-b border-border last:border-0 py-2 text-sm">
                <div className="font-medium">{p.parents?.first_name} {p.parents?.last_name} {p.is_primary && <Badge className="bg-accent/15 text-accent border-accent/30 ml-2">Primary</Badge>}</div>
                <div className="text-xs text-muted-foreground">{p.parents?.phone} · {p.parents?.email}</div>
              </div>
            )) : <div className="text-sm text-muted-foreground">No parents linked.</div>}
          </PageCard>
          <PageCard title="Enrolled Courses" subtitle={`${data.enrollments.length} active`}>
            <div className="space-y-2">
              {data.enrollments.map((e: any, i: number) => (
                <div key={i} className="text-sm border border-border rounded p-2.5">
                  <div className="font-medium">{e.courses?.name}</div>
                  <div className="text-xs text-muted-foreground">{e.courses?.programs?.name} · {e.courses?.start_time?.slice(0,5)}–{e.courses?.end_time?.slice(0,5)} · Room {e.courses?.room || "—"}</div>
                </div>
              ))}
              {!data.enrollments.length && <div className="text-sm text-muted-foreground">No enrollments.</div>}
            </div>
          </PageCard>
        </div>
      )}

      {tab === "attendance" && (
        <PageCard title="Attendance History" subtitle={`Last ${data.attendance.length} records`}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Date</th><th className="py-2">Course</th><th className="py-2">Status</th></tr></thead>
            <tbody>
              {data.attendance.map((a: any, i: number) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2">{a.sessions?.session_date ? format(new Date(a.sessions.session_date), "dd MMM yyyy") : "—"}</td>
                  <td className="py-2">{a.sessions?.courses?.name}</td>
                  <td className="py-2"><Badge className={getStatusColor(a.status)}>{a.status}</Badge></td>
                </tr>
              ))}
              {!data.attendance.length && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No records.</td></tr>}
            </tbody>
          </table>
        </PageCard>
      )}

      {tab === "finance" && (
        <div className="space-y-4">
          <PageCard title="Invoices">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Invoice #</th><th>Period</th><th>Status</th><th className="text-right">Outstanding</th></tr></thead>
              <tbody>
                {data.invoices.map((i: any) => (
                  <tr key={i.id} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs">{i.invoice_number}</td>
                    <td className="py-2">{i.period_month}/{i.period_year}</td>
                    <td className="py-2"><Badge className={getStatusColor(i.status)}>{i.status}</Badge></td>
                    <td className="py-2 text-right">{formatKES(i.amount_outstanding)}</td>
                  </tr>
                ))}
                {!data.invoices.length && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No invoices.</td></tr>}
              </tbody>
            </table>
          </PageCard>
          <PageCard title="Payments">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b border-border"><th>Receipt</th><th>Method</th><th>Date</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs">{p.receipt_number}</td>
                    <td className="py-2"><Badge className={getStatusColor(p.payment_method)}>{p.payment_method}</Badge></td>
                    <td className="py-2">{format(new Date(p.payment_date), "dd MMM yyyy")}</td>
                    <td className="py-2 text-right font-semibold">{formatKES(p.amount)}</td>
                  </tr>
                ))}
                {!data.payments.length && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No payments.</td></tr>}
              </tbody>
            </table>
          </PageCard>
        </div>
      )}

      {tab === "portfolio" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.artwork.map((a: any) => (
            <div key={a.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="aspect-square bg-muted">{a.file_url ? <img src={a.file_url} alt={a.title} className="w-full h-full object-cover" /> : null}</div>
              <div className="p-2.5">
                <div className="text-sm font-medium truncate">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.medium || "—"}</div>
              </div>
            </div>
          ))}
          {!data.artwork.length && <div className="col-span-full text-center text-muted-foreground py-8">No artwork yet.</div>}
        </div>
      )}

      {tab === "assessments" && (
        <PageCard title="Assessments">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border"><th>Date</th><th>Title</th><th>Score</th><th>Grade</th></tr></thead>
            <tbody>
              {data.assess.map((a: any) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="py-2">{a.assessment_date ? format(new Date(a.assessment_date), "dd MMM yyyy") : "—"}</td>
                  <td className="py-2">{a.title}</td>
                  <td className="py-2">{a.score}/{a.max_score}</td>
                  <td className="py-2"><Badge className="bg-accent/15 text-accent border-accent/30">{a.grade || "—"}</Badge></td>
                </tr>
              ))}
              {!data.assess.length && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No assessments.</td></tr>}
            </tbody>
          </table>
        </PageCard>
      )}

      {tab === "notes" && (
        <PageCard title="Notes">
          <p className="text-sm whitespace-pre-wrap">{s.notes || <span className="text-muted-foreground">No notes recorded.</span>}</p>
        </PageCard>
      )}
    </div>
  );
}

function Info({ l, v }: { l: string; v: string }) {
  return <div><dt className="text-xs text-muted-foreground">{l}</dt><dd className="font-medium">{v}</dd></div>;
}

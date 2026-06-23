import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES, getStatusColor } from "@/lib/pla";
import { Wallet, Receipt } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const [studentId, setStudentId] = useState<string | undefined>();

  // Parents pick a child; students view themselves
  const { data: studentList } = useQuery({
    queryKey: ["account-children", user?.id, user?.role, user?.linked_entity_id],
    queryFn: async () => {
      if (user?.role === "student") return [{ id: user.linked_entity_id, first_name: user.first_name, last_name: user.last_name }];
      if (user?.role === "parent" && user.linked_entity_id) {
        const { data } = await supabase.from("student_parents").select("students(id,first_name,last_name)").eq("parent_id", user.linked_entity_id);
        return (data ?? []).map((r: any) => r.students).filter(Boolean);
      }
      return [];
    },
  });

  const activeId = studentId ?? studentList?.[0]?.id;

  const { data } = useQuery({
    queryKey: ["account-detail", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const [{ data: account }, { data: invoices }, { data: payments }] = await Promise.all([
        supabase.from("student_accounts").select("*").eq("student_id", activeId).maybeSingle(),
        supabase.from("invoices").select("*").eq("student_id", activeId).order("issue_date", { ascending: false }),
        supabase.from("payments").select("*").eq("student_id", activeId).order("payment_date", { ascending: false }),
      ]);
      return { account, invoices: invoices ?? [], payments: payments ?? [] };
    },
  });

  const ledger = useMemo(() => {
    if (!data) return [];
    const entries: any[] = [];
    data.invoices.forEach((i: any) => entries.push({ date: i.issue_date, type: "Invoice", ref: i.invoice_number, debit: i.total_amount, credit: 0 }));
    data.payments.forEach((p: any) => entries.push({ date: p.payment_date, type: "Payment", ref: p.receipt_number, debit: 0, credit: p.amount }));
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <div className="space-y-4">
      {studentList && studentList.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {studentList.map((s: any) => (
            <button key={s.id} onClick={() => setStudentId(s.id)} className={`px-3 py-1.5 text-sm rounded-md border ${activeId === s.id ? "bg-accent text-accent-foreground border-accent" : "border-border"}`}>
              {s.first_name} {s.last_name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Charges" value={formatKES(data?.account?.total_fees ?? 0)} icon={<Receipt className="size-5" />} />
        <StatCard label="Total Paid" value={formatKES(data?.account?.total_paid ?? 0)} icon={<Wallet className="size-5" />} tone="success" />
        <StatCard label="Outstanding" value={formatKES(data?.account?.total_outstanding ?? 0)} icon={<Wallet className="size-5" />} tone="gold" />
      </div>

      <PageCard title="Account Statement" subtitle="All charges and payments">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Date</th><th>Type</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
          <tbody>
            {ledger.map((e, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2.5">{format(new Date(e.date), "dd MMM yyyy")}</td>
                <td className="py-2.5"><Badge className={getStatusColor(e.type === "Payment" ? "paid" : "pending")}>{e.type}</Badge></td>
                <td className="py-2.5 font-mono text-xs">{e.ref}</td>
                <td className="py-2.5 text-right">{e.debit ? formatKES(e.debit) : "—"}</td>
                <td className="py-2.5 text-right text-success">{e.credit ? formatKES(e.credit) : "—"}</td>
              </tr>
            ))}
            {!ledger.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No transactions.</td></tr>}
          </tbody>
        </table>
      </PageCard>

      <PageCard title="Outstanding Invoices">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Invoice</th><th>Due</th><th>Total</th><th>Outstanding</th><th>Status</th></tr></thead>
          <tbody>
            {data?.invoices.filter((i: any) => Number(i.amount_outstanding) > 0).map((i: any) => (
              <tr key={i.id} className="border-b border-border/50">
                <td className="py-2.5 font-mono text-xs">{i.invoice_number}</td>
                <td className="py-2.5 text-muted-foreground">{format(new Date(i.due_date), "dd MMM")}</td>
                <td className="py-2.5">{formatKES(i.total_amount)}</td>
                <td className="py-2.5 font-semibold text-accent">{formatKES(i.amount_outstanding)}</td>
                <td className="py-2.5"><Badge className={getStatusColor(i.status)}>{i.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageCard>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES, getStatusColor } from "@/lib/pla";

export const Route = createFileRoute("/_app/children")({
  component: ChildrenPage,
});

function ChildrenPage() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-children", user?.linked_entity_id],
    queryFn: async () => {
      if (!user?.linked_entity_id) return [];
      const { data: sp } = await supabase
        .from("student_parents")
        .select("students(*,student_accounts(total_outstanding))")
        .eq("parent_id", user.linked_entity_id);
      return (sp ?? []).map((r: any) => r.students).filter(Boolean);
    },
  });

  return (
    <PageCard title="My Children" subtitle={`${data?.length ?? 0} linked`}>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((c: any) => (
          <Link key={c.id} to="/students/$id" params={{ id: c.id }} className="border border-border rounded-xl p-4 hover:border-accent transition bg-background/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-12 rounded-full bg-primary flex items-center justify-center font-semibold">{c.first_name?.[0]}{c.last_name?.[0]}</div>
              <div className="flex-1">
                <div className="font-semibold">{c.first_name} {c.last_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{c.admission_number}</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <Badge className={getStatusColor(c.status)}>{c.status}</Badge>
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground">Balance</div>
                <div className="font-bold text-accent">{formatKES(c.student_accounts?.[0]?.total_outstanding ?? 0)}</div>
              </div>
            </div>
          </Link>
        ))}
        {!data?.length && <div className="md:col-span-3 text-center py-8 text-muted-foreground">No children linked.</div>}
      </div>
    </PageCard>
  );
}

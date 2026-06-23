import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { Search } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => (await supabase.from("audit_log").select("*,users(first_name,last_name,email)").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data ?? []).filter((r: any) =>
      (actionFilter === "all" || r.action === actionFilter) &&
      (!q || `${r.users?.email ?? ""} ${r.entity_type ?? ""} ${r.action ?? ""}`.toLowerCase().includes(q)),
    );
  }, [data, search, actionFilter]);

  return (
    <PageCard title="Audit Log" subtitle="System activity trail">
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full bg-background border border-input rounded-md pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm">
          <option value="all">All actions</option><option>create</option><option>update</option><option>delete</option><option>login</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">When</th><th>User</th><th>Action</th><th>Entity</th><th>ID</th></tr></thead>
          <tbody>
            {filtered.map((r: any) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="py-2.5 text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM HH:mm:ss")}</td>
                <td className="py-2.5">{r.users ? `${r.users.first_name} ${r.users.last_name}` : <span className="text-muted-foreground">System</span>}</td>
                <td className="py-2.5"><Badge className="bg-muted text-foreground border-border">{r.action}</Badge></td>
                <td className="py-2.5">{r.entity_type}</td>
                <td className="py-2.5 font-mono text-xs text-muted-foreground">{r.entity_id?.slice(0, 8) ?? "—"}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No records.</td></tr>}
          </tbody>
        </table>
      </div>
    </PageCard>
  );
}

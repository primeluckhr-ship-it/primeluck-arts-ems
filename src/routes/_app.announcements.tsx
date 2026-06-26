import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["announcements", user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("announcements").select("*").eq("is_published", true).order("created_at", { ascending: false });
      if (user?.role !== "super_admin") q = q.eq("branch_id", user?.branch_id ?? "");
      return (await q).data ?? [];
    },
  });

  const urgent = (data ?? []).filter((a: any) => a.priority === "urgent");
  const others = (data ?? []).filter((a: any) => a.priority !== "urgent");
  const canManage = user?.role === "super_admin";

  async function remove(id: string) {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  return (
    <div className="space-y-4">
      {urgent.map((a: any) => (
        <div key={a.id} className="border border-danger/40 bg-danger/10 text-danger rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">{a.title}</div>
            <div className="text-sm whitespace-pre-wrap mt-1">{a.content}</div>
          </div>
        </div>
      ))}

      <PageCard
        title="Announcements"
        action={canManage && <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Post</button>}
      >
        <div className="space-y-3">
          {others.map((a: any) => (
            <div key={a.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge className={a.priority === "high" ? "bg-warning/15 text-warning border-warning/30" : "bg-muted text-muted-foreground border-border"}>{a.priority}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                  <div className="text-xs text-muted-foreground mt-2">{format(new Date(a.created_at), "dd MMM yyyy · HH:mm")}</div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(a); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button>
                    <button onClick={() => remove(a.id)} className="p-1.5 rounded hover:bg-muted text-danger"><Trash2 className="size-4" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!others.length && !urgent.length && <div className="text-center py-8 text-muted-foreground">No announcements yet.</div>}
        </div>
      </PageCard>

      {open && <AnnForm initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["announcements"] }); }} />}
    </div>
  );
}

function AnnForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    content: initial?.content ?? "",
    priority: initial?.priority ?? "normal",
    is_published: initial?.is_published ?? true,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const payload: any = { ...form, created_by: user?.id, branch_id: user?.branch_id ?? "" };
      if (initial) await supabase.from("announcements").update(payload).eq("id", initial.id).throwOnError();
      else await supabase.from("announcements").insert(payload).throwOnError();
      toast.success("Posted"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "New"} Announcement</h2>
        <div className="space-y-3">
          <Field label="Title"><Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} /></Field>
          <Field label="Content"><textarea value={form.content} rows={5} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" /></Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Post</button>
        </div>
      </div>
    </div>
  );
}

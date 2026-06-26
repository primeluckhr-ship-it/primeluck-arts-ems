import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Pencil, Trash2, AlertTriangle, MessageCircle, X, Copy, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/announcements")({ component: AnnouncementsPage });

// ── WhatsApp Parents Modal ─────────────────────────────────────────────────
function WhatsAppModal({ announcement, branch, onClose }: { announcement: any; branch: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const academy = branch === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy";

  const { data: parents, isLoading } = useQuery({
    queryKey: ["parents-whatsapp", branch],
    queryFn: async () => {
      // Get parents linked to students in this branch
      const { data: links } = await supabase
        .from("student_parents")
        .select("parent_id, students!inner(branch_id)")
        .eq("students.branch_id", branch);
      const parentIds = [...new Set((links ?? []).map((l: any) => l.parent_id))];
      if (!parentIds.length) return [];
      const { data } = await supabase.from("parents")
        .select("id,first_name,last_name,whatsapp,phone")
        .in("id", parentIds)
        .order("first_name");
      return (data ?? []).filter((p: any) => p.whatsapp || p.phone);
    },
  });

  const message = encodeURIComponent(
    `🎨 *${academy}*\n📢 *${announcement.title}*\n\n${announcement.content}\n\n_Sent by the Academy team_`
  );

  const rawMessage = `🎨 *${academy}*\n📢 *${announcement.title}*\n\n${announcement.content}\n\n_Sent by the Academy team_`;

  function openWhatsApp(p: any) {
    const num = (p.whatsapp || p.phone || "").replace(/\D/g, "");
    if (!num) { toast.error(`No number for ${p.first_name}`); return; }
    window.open(`https://wa.me/${num}?text=${message}`, "_blank");
  }

  function copyMessage() {
    navigator.clipboard.writeText(rawMessage);
    setCopied(true);
    toast.success("Message copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-green-400"/>
            <h2 className="font-semibold">Send via WhatsApp</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted"><X className="size-4"/></button>
        </div>

        {/* Message preview */}
        <div className="p-4 border-b border-border">
          <div className="text-xs font-medium text-muted-foreground mb-2">Message preview</div>
          <div className="bg-green-950/30 border border-green-800/30 rounded-xl p-3 text-sm whitespace-pre-wrap text-green-100">
            {rawMessage}
          </div>
          <button onClick={copyMessage}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="size-3 text-success"/> : <Copy className="size-3"/>}
            {copied ? "Copied!" : "Copy message"}
          </button>
        </div>

        {/* Parents list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-3">
            {isLoading ? "Loading parents…" : `${parents?.length ?? 0} parent(s) with WhatsApp`}
          </div>
          {(parents ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">{p.first_name} {p.last_name}</div>
                <div className="text-xs text-muted-foreground">{p.whatsapp || p.phone}</div>
              </div>
              <button onClick={() => openWhatsApp(p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors">
                <Send className="size-3"/> Send
              </button>
            </div>
          ))}
          {!isLoading && !parents?.length && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No parents with WhatsApp numbers found.<br/>
              Add WhatsApp numbers in the Parents section.
            </p>
          )}
        </div>

        {/* Send all */}
        {(parents?.length ?? 0) > 1 && (
          <div className="p-4 border-t border-border">
            <button
              onClick={() => { parents?.forEach((p: any) => openWhatsApp(p)); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-colors">
              <MessageCircle className="size-4"/>
              Open all {parents?.length} chats
            </button>
            <p className="text-xs text-muted-foreground text-center mt-1.5">Opens each parent's WhatsApp chat in a new tab</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
function AnnouncementsPage() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [waAnnouncement, setWaAnnouncement] = useState<any>(null);

  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const canManage = ["super_admin","finance_admin","dice_admin"].includes(user?.role ?? "");

  const { data } = useQuery({
    queryKey: ["announcements", branch],
    queryFn: async () => {
      let q = supabase.from("announcements").select("*").eq("is_published", true).order("created_at", { ascending: false });
      if (user?.role !== "super_admin") q = q.eq("branch_id", user?.branch_id ?? "");
      else q = q.eq("branch_id", branch);
      return (await q).data ?? [];
    },
  });

  const urgent = (data ?? []).filter((a: any) => a.priority === "urgent");
  const others = (data ?? []).filter((a: any) => a.priority !== "urgent");

  async function remove(id: string) {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  return (
    <div className="space-y-4">
      {waAnnouncement && (
        <WhatsAppModal
          announcement={waAnnouncement}
          branch={branch}
          onClose={() => setWaAnnouncement(null)}
        />
      )}

      {urgent.map((a: any) => (
        <div key={a.id} className="border border-danger/40 bg-danger/10 text-danger rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">{a.title}</div>
            <div className="text-sm whitespace-pre-wrap mt-1">{a.content}</div>
          </div>
          {canManage && (
            <button onClick={() => setWaAnnouncement(a)}
              className="p-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 shrink-0" title="Send via WhatsApp">
              <MessageCircle className="size-4"/>
            </button>
          )}
        </div>
      ))}

      <PageCard
        title="Announcements"
        action={canManage && (
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4" /> Post
          </button>
        )}
      >
        <div className="space-y-3">
          {others.map((a: any) => (
            <div key={a.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge className={a.priority === "high" ? "bg-warning/15 text-warning border-warning/30" : "bg-muted text-muted-foreground border-border"}>
                      {a.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                  <div className="text-xs text-muted-foreground mt-2">{format(new Date(a.created_at), "dd MMM yyyy · HH:mm")}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {canManage && (
                    <>
                      <button onClick={() => setWaAnnouncement(a)}
                        className="p-1.5 rounded hover:bg-green-600/20 text-green-400" title="Send via WhatsApp">
                        <MessageCircle className="size-4"/>
                      </button>
                      <button onClick={() => { setEditing(a); setOpen(true); }} className="p-1.5 rounded hover:bg-muted">
                        <Pencil className="size-4"/>
                      </button>
                      <button onClick={() => remove(a.id)} className="p-1.5 rounded hover:bg-muted text-danger">
                        <Trash2 className="size-4"/>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!others.length && !urgent.length && (
            <div className="text-center py-8 text-muted-foreground">No announcements yet.</div>
          )}
        </div>
      </PageCard>

      {open && (
        <AnnForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["announcements"] }); }}
          branch={branch}
        />
      )}
    </div>
  );
}

// ── Announcement Form ───────────────────────────────────────────────────────
function AnnForm({ initial, onClose, onSaved, branch }: { initial: any; onClose: () => void; onSaved: () => void; branch: string }) {
  const { user } = useAuth();
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
      const payload: any = { ...form, created_by: user?.id, branch_id: branch };
      if (initial) await supabase.from("announcements").update(payload).eq("id", initial.id).throwOnError();
      else await supabase.from("announcements").insert(payload).throwOnError();
      toast.success("Posted");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "New"} Announcement</h2>
        <div className="space-y-3">
          <Field label="Title"><Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} /></Field>
          <Field label="Content">
            <textarea value={form.content} rows={5} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

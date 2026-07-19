import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard } from "@/components/app-shell";
import { Plus, Pencil, MessageCircle, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/parents")({ component: ParentsPage });

function ParentsPage() {
  const { user, activeBranch } = useAuth();
  const qc = useQueryClient();
  const parentBranch = user?.role === "super_admin" ? (activeBranch ?? "") : (user?.branch_id ?? "");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["parents-list", parentBranch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("*,student_parents(is_primary,students(id,first_name,last_name,admission_number,status,branch_id))")
        .order("first_name");
      if (error) throw error;
      if (!parentBranch) return data ?? [];
      // Filter client-side: only parents linked to students in this branch
      return (data ?? []).filter((p: any) =>
        (p.student_parents ?? []).some((sp: any) => sp.students?.branch_id === parentBranch)
      );
    },
  });

  async function deleteParent(p: any) {
    if (!confirm(`Delete ${p.first_name} ${p.last_name}? This will remove them and all student links.`)) return;
    await supabase.from("student_parents").delete().eq("parent_id", p.id);
    const { error } = await supabase.from("parents").delete().eq("id", p.id);
    if (error) { toast.error("Could not delete: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["parents-list"] });
    toast.success(`${p.first_name} ${p.last_name} deleted`);
  }

  function sendWhatsApp(p: any) {
    const phone = (p.whatsapp || p.phone || "").replace(/\D/g, "");
    if (!phone) { toast.error("No phone number on record"); return; }
    const num = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
    window.open(`https://wa.me/${num}`, "_blank");
  }

  const filtered = (data ?? []).filter((p: any) =>
    !search || `${p.first_name} ${p.last_name} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <PageCard
        title="Parents / Guardians"
        subtitle={`${filtered.length} contacts`}
        action={
          <button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4" />Add Parent
          </button>
        }>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="w-full bg-background border border-input rounded-md pl-9 pr-3 py-2 text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Children</th>
                <th className="py-2 pr-3">Relationship</th>
                <th className="py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {filtered.map((p: any) => {
                const children = (p.student_parents ?? []).map((sp: any) => sp.students).filter(Boolean);
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{p.first_name} {p.last_name}</div>
                      {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    </td>
                    <td className="py-2.5 pr-3 text-sm">{p.phone || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {children.slice(0, 2).map((c: any, i: number) => (
                          <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {c.first_name} {c.last_name?.[0]}.
                          </span>
                        ))}
                        {children.length > 2 && <span className="text-xs text-muted-foreground">+{children.length - 2}</span>}
                        {!children.length && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground capitalize">{p.relationship || "—"}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => sendWhatsApp(p)} title="Send WhatsApp"
                          className="p-1.5 rounded hover:bg-[#25D366]/10 text-[#25D366]">
                          <MessageCircle className="size-4" />
                        </button>
                        <button onClick={() => { setEditing(p); setOpen(true); }}
                          className="p-1.5 rounded hover:bg-muted" title="Edit">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => deleteParent(p)}
                          className="p-1.5 rounded hover:bg-destructive/20 text-destructive" title="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && !filtered.length && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No parents found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      {open && (
        <ParentForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["parents-list"] });
          }} />
      )}
    </div>
  );
}

// ─── Parent Form ──────────────────────────────────────────────────────────────
function ParentForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const formBranch = user?.role === "super_admin"
    ? (activeBranch ?? user?.branch_id ?? "")
    : (user?.branch_id ?? "");

  const [form, setForm] = useState({
    first_name:   initial?.first_name  ?? "",
    last_name:    initial?.last_name   ?? "",
    email:        initial?.email       ?? "",
    phone:        initial?.phone       ?? "",
    whatsapp:     initial?.whatsapp    ?? "",
    relationship: initial?.relationship ?? "",
    address:      initial?.address     ?? "",
  });
  const [saving, setSaving] = useState(false);

  const [linkedStudents, setLinkedStudents] = useState<string[]>(
    (initial?.student_parents ?? [])
      .map((sp: any) => sp.students?.id)
      .filter(Boolean)
  );

  const { data: students } = useQuery({
    queryKey: ["students-for-parent-form", formBranch],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id,first_name,last_name,admission_number")
        .eq("status", "active")
        .order("first_name");
      if (formBranch) q = q.eq("branch_id", formBranch);
      const { data } = await q;
      return data ?? [];
    },
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleStudent(id: string) {
    setLinkedStudents(ls => ls.includes(id) ? ls.filter(x => x !== id) : [...ls, id]);
  }

  async function save() {
    if (!form.first_name.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    setSaving(true);
    try {
      // Build payload — only send known columns, convert empty strings to null
      const payload: Record<string, any> = {
        first_name:   form.first_name.trim(),
        last_name:    form.last_name.trim() || null,
        email:        form.email.trim().toLowerCase() || null,
        phone:        form.phone.trim(),          // NOT NULL in DB — required
        whatsapp:     form.whatsapp.trim() || null,
        relationship: form.relationship || null,
        address:      form.address.trim() || null,
      };

      let parentId: string;

      if (initial?.id) {
        // UPDATE existing parent
        parentId = initial.id;
        const { error } = await supabase
          .from("parents")
          .update(payload)
          .eq("id", parentId);
        if (error) throw new Error(`Save failed: ${error.message} (code: ${error.code})`);
      } else {
        // CREATE new parent
        parentId = crypto.randomUUID();
        const { error } = await supabase
          .from("parents")
          .insert({ id: parentId, ...payload });
        if (error) throw new Error(`Save failed: ${error.message} (code: ${error.code})`);
      }

      // Sync student links — delete all existing, then re-insert selected ones
      const { error: delErr } = await supabase
        .from("student_parents")
        .delete()
        .eq("parent_id", parentId);

      if (delErr) {
        // Non-critical — parent was saved, student links failed
        toast.warning(`Parent saved but student links failed: ${delErr.message}`);
      } else if (linkedStudents.length > 0) {
        const { error: insErr } = await supabase
          .from("student_parents")
          .insert(
            linkedStudents.map((sid, i) => ({
              student_id: sid,
              parent_id:  parentId,
              is_primary: i === 0,
            }))
          );
        if (insErr) {
          toast.warning(`Parent saved but student links failed: ${insErr.message}`);
        }
      }

      toast.success(initial?.id ? "Parent updated" : "Parent added");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Unknown error", { duration: 10000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 my-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial?.id ? "Edit Parent" : "New Parent"}</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name *">
            <Input value={form.first_name} onChange={(v) => set("first_name", v)} placeholder="Required" />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={(v) => set("last_name", v)} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <Input value={form.email} onChange={(v) => set("email", v)} placeholder="Optional" />
          </Field>
          <Field label="Phone *">
            <Input value={form.phone} onChange={(v) => set("phone", v)} placeholder="+2547… (required)" />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={(v) => set("whatsapp", v)} placeholder="+2547… (optional)" />
          </Field>
          <Field label="Relationship">
            <select
              value={form.relationship}
              onChange={(e) => set("relationship", e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select —</option>
              <option value="mother">Mother</option>
              <option value="father">Father</option>
              <option value="parent">Parent</option>
              <option value="guardian">Guardian</option>
              <option value="grandmother">Grandmother</option>
              <option value="grandfather">Grandfather</option>
              <option value="aunt">Aunt</option>
              <option value="uncle">Uncle</option>
              <option value="sibling">Sibling</option>
              <option value="sponsor">Sponsor</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(v) => set("address", v)} />
          </Field>

          <Field label="Link to student(s)" className="sm:col-span-2">
            <div className="border border-input rounded-md p-2 max-h-36 overflow-y-auto space-y-0.5">
              {(students ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground px-1 py-2">No active students found</p>
              )}
              {(students ?? []).map((s: any) => (
                <label key={s.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkedStudents.includes(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    className="accent-accent" />
                  <span className="text-sm">{s.first_name} {s.last_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto font-mono">{s.admission_number}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Saving…" : initial?.id ? "Update" : "Add Parent"}
          </button>
        </div>
      </div>
    </div>
  );
}

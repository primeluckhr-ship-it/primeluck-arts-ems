import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { sha256, roleLabel } from "@/lib/pla";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const ROLE_STYLES: Record<string, string> = {
  super_admin: "bg-accent text-accent-foreground border-accent",
  finance_admin: "bg-warning/20 text-warning border-warning/40",
  teacher: "bg-success/20 text-success border-success/40",
  parent: "bg-primary/40 text-foreground border-primary",
  student: "bg-muted text-foreground border-border",
};

function SettingsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await supabase.from("users").select("id,email,first_name,last_name,role,is_active,linked_entity_id,branch_id,last_login").order("created_at", { ascending: false })).data ?? [],
  });

  async function toggleActive(u: any) {
    await supabase.from("users").update({ is_active: !u.is_active }).eq("id", u.id);
    toast.success(u.is_active ? "Deactivated" : "Activated");
    qc.invalidateQueries({ queryKey: ["users-list"] });
  }

  return (
    <div className="space-y-4">
      <PageCard
        title="System Users"
        subtitle={`${data?.length ?? 0} accounts`}
        action={<button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Add User</button>}
      >
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((u: any) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="py-2.5 font-medium">{u.first_name} {u.last_name}</td>
                <td className="py-2.5 text-muted-foreground">{u.email}</td>
                <td className="py-2.5"><Badge className={ROLE_STYLES[u.role] ?? "bg-muted"}>{roleLabel(u.role)}</Badge></td>
                <td className="py-2.5">
                  <button onClick={() => toggleActive(u)} className={`text-xs px-2 py-0.5 rounded border ${u.is_active ? "bg-success/15 text-success border-success/40" : "bg-danger/15 text-danger border-danger/40"}`}>
                    {u.is_active ? "active" : "inactive"}
                  </button>
                </td>
                <td className="py-2.5 text-xs text-muted-foreground">{u.last_login ? new Date(u.last_login).toLocaleString() : "—"}</td>
                <td><button onClick={() => { setEditing(u); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button></td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No users.</td></tr>}
          </tbody>
        </table>
      </PageCard>

      {open && <UserForm initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["users-list"] }); }} />}
    </div>
  );
}

function UserForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    email: initial?.email ?? "",
    role: initial?.role ?? "teacher",
    password: "",
    is_active: initial?.is_active ?? true,
    linked_entity_id: initial?.linked_entity_id ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.email || !form.first_name || !form.last_name) { toast.error("Required fields missing"); return; }
    if (!initial && !form.password) { toast.error("Password is required"); return; }
    setSaving(true);
    try {
      const payload: any = {
        email: form.email.toLowerCase().trim(),
        first_name: form.first_name, last_name: form.last_name,
        role: form.role, is_active: form.is_active,
        linked_entity_id: form.linked_entity_id || null,
      };
      if (form.password) payload.password_hash = await sha256(form.password);
      if (initial) await supabase.from("users").update(payload).eq("id", initial.id).throwOnError();
      else await supabase.from("users").insert(payload).throwOnError();
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Add"} User</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} /></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} /></Field>
          <Field label="Email" className="sm:col-span-2"><Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="super_admin">Super Admin</option>
              <option value="finance_admin">Finance Admin</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
              <option value="student">Student</option>
            </select>
          </Field>
          <Field label={initial ? "New password (leave blank to keep)" : "Password"}><Input type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} /></Field>
          <Field label="Linked entity ID (parent/student)" className="sm:col-span-2"><Input value={form.linked_entity_id} onChange={(v) => setForm({ ...form, linked_entity_id: v })} placeholder="UUID of parent or student row" /></Field>
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

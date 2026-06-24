import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { sha256 } from "@/lib/pla";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Pencil, Building2, Users, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

const ROLE_COLORS: Record<string, string> = {
  super_admin:  "bg-red-500/15 text-red-400 border-red-500/30",
  finance_admin:"bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  teacher:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  parent:       "bg-green-500/15 text-green-400 border-green-500/30",
  student:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  dice_admin:   "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

function SettingsPage() {
  const [tab, setTab] = useState<"users"|"institutions"|"terms">("users");
  const { user } = useAuth();
  if (user?.role !== "super_admin") return <div className="p-8 text-center text-muted-foreground">Access denied</div>;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {([
          { key:"users",        icon:<Users className="size-4"/>,       label:"Users" },
          { key:"institutions", icon:<Building2 className="size-4"/>,   label:"Institutions" },
          { key:"terms",        icon:<CalendarRange className="size-4"/>,label:"Terms" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 ${tab===t.key?"border-accent text-accent":"border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab==="users"        && <UsersTab />}
      {tab==="institutions" && <InstitutionsTab />}
      {tab==="terms"        && <TermsTab />}
    </div>
  );
}

/* ── USERS ── */
function UsersTab() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey:["users-list"],
    queryFn: async () => (await supabase.from("users").select("*").order("role")).data ?? [],
  });
  return (
    <PageCard title="System Users" subtitle="Manage access and roles"
      action={<button onClick={() => { setEditing(null); setOpen(true); }}
        className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
        <Plus className="size-4"/>Add User</button>}>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground border-b border-border">
          <th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Email</th>
          <th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Branch</th><th className="py-2 w-10"></th>
        </tr></thead>
        <tbody>
          {isLoading && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
          {(data??[]).map((u:any) => (
            <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2.5 pr-3 font-medium">{u.first_name} {u.last_name}</td>
              <td className="py-2.5 pr-3 text-muted-foreground text-xs">{u.email}</td>
              <td className="py-2.5 pr-3"><Badge className={ROLE_COLORS[u.role]??""}>
                {u.role.replace(/_/g," ")}</Badge></td>
              <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                {u.branch_id==="dice-arts-nairobi"?"Dice Arts":"PrimeLuck"}</td>
              <td className="py-2.5"><button onClick={() => { setEditing(u); setOpen(true); }}
                className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4"/></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <UserForm initial={editing} onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); qc.invalidateQueries({queryKey:["users-list"]}); }}/>}
    </PageCard>
  );
}

function UserForm({ initial, onClose, onSaved }:{ initial:any; onClose:()=>void; onSaved:()=>void }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name??"", last_name: initial?.last_name??"",
    email: initial?.email??"", role: initial?.role??"teacher",
    branch_id: initial?.branch_id??"", is_active: initial?.is_active??true,
    linked_entity_id: initial?.linked_entity_id??"",
  });
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Load linkable entities based on role
  const needsLink = ["parent","student"].includes(form.role);
  const { data: linkOptions } = useQuery({
    queryKey: ["link-options", form.role],
    enabled: needsLink,
    queryFn: async () => {
      if (form.role === "parent") {
        const { data } = await supabase.from("parents").select("id,first_name,last_name").order("first_name");
        return (data??[]).map((p:any) => ({ id: p.id, label: `${p.first_name} ${p.last_name}` }));
      }
      if (form.role === "student") {
        const { data } = await supabase.from("students").select("id,first_name,last_name,admission_number").order("first_name");
        return (data??[]).map((s:any) => ({ id: s.id, label: `${s.first_name} ${s.last_name} (${s.admission_number})` }));
      }
      return [];
    },
  });

  const { data: branches } = useQuery({
    queryKey:["branches-list"],
    queryFn: async () => (await supabase.from("branches").select("id,name")).data??[],
  });

  async function save() {
    setSaving(true);
    try {
      const payload:any = { ...form };
      if (password) payload.password_hash = await sha256(password);
      if (!needsLink) payload.linked_entity_id = null;
      if (initial) {
        const { error } = await supabase.from("users").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("User updated");
      } else {
        if (!password) { toast.error("Password required"); setSaving(false); return; }
        payload.id = crypto.randomUUID();
        const { error } = await supabase.from("users").insert(payload);
        if (error) throw error;
        toast.success("User created");
      }
      onSaved();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">{initial?"Edit User":"New User"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name} onChange={(v) => setForm({...form,first_name:v})}/></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v) => setForm({...form,last_name:v})}/></Field>
          <Field label="Email" className="sm:col-span-2"><Input value={form.email} onChange={(v) => setForm({...form,email:v})}/></Field>
          <Field label="Role" className="sm:col-span-2">
            <select value={form.role} onChange={(e) => setForm({...form,role:e.target.value,linked_entity_id:""})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="super_admin">Super Admin (PLA)</option>
              <option value="finance_admin">Finance Admin (PLA)</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
              <option value="student">Student</option>
              <option value="dice_admin">Dice Arts Admin</option>
            </select>
          </Field>
          <Field label="Branch" className="sm:col-span-2">
            <select value={form.branch_id} onChange={(e) => setForm({...form,branch_id:e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select branch —</option>
              {(branches??[]).map((b:any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          {needsLink && (
            <Field label={form.role==="parent"?"Link to Parent record":"Link to Student record"} className="sm:col-span-2">
              <select value={form.linked_entity_id} onChange={(e) => setForm({...form,linked_entity_id:e.target.value})}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option value="">— Select {form.role} —</option>
                {(linkOptions??[]).map((o:any) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          )}
          <Field label={initial?"New password (blank = keep)":"Password"} className="sm:col-span-2">
            <Input type="password" value={password} onChange={(v) => setPassword(v)}
              placeholder={initial?"Leave blank to keep current":"Set password"}/>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── INSTITUTIONS ── */
function InstitutionsTab() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey:["institutions-list"],
    queryFn: async () => (await supabase.from("institutions").select("*").order("name")).data??[],
  });
  return (
    <PageCard title="Institutions" subtitle="Schools and organisations billed as groups"
      action={<button onClick={() => { setEditing(null); setOpen(true); }}
        className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
        <Plus className="size-4"/>Add Institution</button>}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="col-span-3 py-6 text-center text-muted-foreground">Loading…</p>}
        {(data??[]).map((inst:any) => (
          <div key={inst.id} className="rounded-xl border border-border bg-background p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-lg bg-accent/15 flex items-center justify-center text-accent font-bold text-sm">{inst.name[0]}</div>
                <div><div className="font-semibold text-sm">{inst.name}</div>
                <div className="text-xs text-muted-foreground">{inst.contact_person}</div></div>
              </div>
              <button onClick={() => { setEditing(inst); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4"/></button>
            </div>
            {inst.phone && <div className="text-xs text-muted-foreground">{inst.phone}</div>}
            {inst.email && <div className="text-xs text-muted-foreground">{inst.email}</div>}
          </div>
        ))}
        {!isLoading && !data?.length && <p className="col-span-3 py-8 text-center text-muted-foreground">No institutions yet</p>}
      </div>
      {open && <InstitutionForm initial={editing} onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); qc.invalidateQueries({queryKey:["institutions-list"]}); }}/>}
    </PageCard>
  );
}

function InstitutionForm({ initial, onClose, onSaved }:{ initial:any; onClose:()=>void; onSaved:()=>void }) {
  const [form, setForm] = useState({
    name: initial?.name??"", contact_person: initial?.contact_person??"",
    phone: initial?.phone??"", email: initial?.email??"",
    address: initial?.address??"", notes: initial?.notes??"", is_active: initial?.is_active??true,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      if (initial) {
        const { error } = await supabase.from("institutions").update(form).eq("id", initial.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
        const { error } = await supabase.from("institutions").insert({...form, branch_id: branch?.id});
        if (error) throw error;
        toast.success("Institution added");
      }
      onSaved();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{initial?"Edit Institution":"New Institution"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Institution name" className="sm:col-span-2"><Input value={form.name} onChange={(v) => setForm({...form,name:v})}/></Field>
          <Field label="Contact person"><Input value={form.contact_person} onChange={(v) => setForm({...form,contact_person:v})}/></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(v) => setForm({...form,phone:v})}/></Field>
          <Field label="Email" className="sm:col-span-2"><Input value={form.email} onChange={(v) => setForm({...form,email:v})}/></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(v) => setForm({...form,address:v})}/></Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm({...form,notes:e.target.value})}
              rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── TERMS ── */
function TermsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey:["terms-list"],
    queryFn: async () => (await supabase.from("terms").select("*").order("year").order("term_number")).data??[],
  });
  async function setCurrent(id:string) {
    const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
    await supabase.from("terms").update({is_current:false}).eq("branch_id", branch?.id);
    await supabase.from("terms").update({is_current:true}).eq("id", id);
    qc.invalidateQueries({queryKey:["terms-list"]});
    toast.success("Current term updated");
  }
  return (
    <PageCard title="Academic Terms" subtitle="Set which term is currently active">
      <div className="space-y-2">
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        {(data??[]).map((t:any) => (
          <div key={t.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${t.is_current?"border-accent bg-accent/5":"border-border"}`}>
            <div className="flex items-center gap-3">
              <div className={`size-2 rounded-full ${t.is_current?"bg-accent":"bg-muted-foreground"}`}/>
              <div><div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.start_date} → {t.end_date}</div></div>
            </div>
            {t.is_current
              ? <Badge className="bg-accent/15 text-accent border-accent/30">Current</Badge>
              : <button onClick={() => setCurrent(t.id)} className="text-xs text-muted-foreground hover:text-accent underline">Set current</button>}
          </div>
        ))}
      </div>
    </PageCard>
  );
}

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
  instructor:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  parent:       "bg-green-500/15 text-green-400 border-green-500/30",
  student:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  dice_admin:   "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

function SettingsPage() {
  const [tab, setTab] = useState<"users"|"institutions"|"terms"|"branches">("users");
  const { user } = useAuth();
  if (user?.role !== "super_admin") return <div className="p-8 text-center text-muted-foreground">Access denied</div>;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {([
          { key:"users",        icon:<Users className="size-4"/>,       label:"Users" },
          { key:"branches",     icon:<Building2 className="size-4"/>,   label:"Branches / Academies" },
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
      {tab==="branches"     && <BranchesTab />}
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
    queryFn: async () => (await supabase.from("users").select("*").order("role").throwOnError()).data ?? [],
  });
  async function handleDeleteUser(u: any) {
    if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    await supabase.from("users").delete().eq("id", u.id);
    qc.invalidateQueries({ queryKey: ["users-list"] });
    toast.success("User deleted");
  }

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
  const { user, activeBranch } = useAuth();   // ← must be here, not inherited from parent scope
  const [form, setForm] = useState({
    first_name: initial?.first_name??"", last_name: initial?.last_name??"",
    email: initial?.email??"", role: initial?.role??"instructor",
    branch_id: initial?.branch_id??"", is_active: initial?.is_active??true,
    linked_entity_id: initial?.linked_entity_id??"",
  });
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Load linkable entities based on role
  const needsLink = ["parent","student","teacher","instructor"].includes(form.role);
  const { data: linkOptions } = useQuery({
    queryKey: ["link-options", form.role],
    enabled: needsLink,
    queryFn: async () => {
      if (form.role === "parent") {
        const { data } = await supabase.from("parents").select("id,first_name,last_name").order("first_name");
        return (data??[]).map((p:any) => ({ id: p.id, label: `${p.first_name} ${p.last_name}` }));
      }
      if (form.role === "student") {
        const branchSet = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
        let sq = supabase.from("students").select("id,first_name,last_name,admission_number").order("first_name");
        if (branchSet) sq = sq.eq("branch_id", branchSet);
        const { data } = await sq;
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
      const payload:any = {
        ...form,
        // Normalize email: always lowercase + trim so login query always matches
        email: form.email.toLowerCase().trim(),
        // Convert empty strings to null for nullable FK columns
        branch_id: form.branch_id || null,
        linked_entity_id: (!needsLink || !form.linked_entity_id) ? null : (form.linked_entity_id || null),
      };
      if (password) payload.password_hash = await sha256(password);
      if (initial) {
        const { error } = await supabase.from("users").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("User updated");
      } else {
        if (!password) { toast.error("Password required"); setSaving(false); return; }
        payload.id = crypto.randomUUID();
        const { error } = await supabase.from("users").insert(payload);
        if (error) throw error;
        toast.success("User created — they can now sign in with the email and password you set");
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
              <option value="instructor">Instructor</option>
              <option value="teacher">Teacher (legacy)</option>
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
            <Field label={
                form.role==="parent" ? "Link to Parent record" :
                form.role==="teacher"||form.role==="instructor" ? "Link to Instructor record" :
                "Link to Student record"
              } className="sm:col-span-2">
              <select value={form.linked_entity_id} onChange={(e) => setForm({...form,linked_entity_id:e.target.value})}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option value="">— Select record —</option>
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

// ── Branches / Academies Tab ──────────────────────────────────────────────
function BranchesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", id_slug: "", address: "", city: "Nairobi", phone: "", email: "",
    admin_email: "", admin_password: "", copy_from: "branch-1",
  });

  const { data: branches } = useQuery({
    queryKey: ["branches-all"],
    queryFn: async () => (await supabase.from("branches").select("*").order("created_at").throwOnError()).data ?? [],
  });

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function createBranch() {
    if (!form.name || !form.id_slug || !form.admin_email || !form.admin_password) {
      toast.error("Fill in all required fields"); return;
    }
    setCreating(true);
    try {
      // 1. Create branch
      const { error: brErr } = await supabase.from("branches").insert({
        id: form.id_slug, name: form.name, address: form.address,
        city: form.city, phone: form.phone, email: form.email, status: "active",
      });
      if (brErr) throw brErr;

      // 2. Copy courses from source branch
      if (form.copy_from) {
        const { data: srcCourses } = await supabase.from("courses")
          .select("name,category,schedule_days,start_time,end_time,billing_type,status")
          .eq("branch_id", form.copy_from);
        if (srcCourses?.length) {
          await supabase.from("courses").insert(
            srcCourses.map((c: any) => ({ ...c, branch_id: form.id_slug, instructor_id: null }))
          );
        }
      }

      // 3. Create admin user for new branch
      const { crypto: cr } = window;
      const hashBuf = await cr.subtle.digest("SHA-256", new TextEncoder().encode(form.admin_password));
      const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
      const { error: uErr } = await supabase.from("users").insert({
        email: form.admin_email.toLowerCase(),
        password_hash: hashHex,
        role: "finance_admin",
        branch_id: form.id_slug,
        full_name: `${form.name} Admin`,
      });
      if (uErr) throw uErr;

      toast.success(`"${form.name}" branch created with admin user and courses copied!`);
      qc.invalidateQueries({ queryKey: ["branches-all"] });
      setShowNew(false);
      setForm({ name:"", id_slug:"", address:"", city:"Nairobi", phone:"", email:"", admin_email:"", admin_password:"", copy_from:"branch-1" });
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-4">
      <PageCard title="Academies & Branches" action={
        <button onClick={() => setShowNew(!showNew)}
          className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
          <Plus className="size-4"/>New Branch
        </button>
      }>
        {/* Existing branches */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(branches ?? []).map((b: any) => (
            <div key={b.id} className="rounded-xl border border-border p-4 space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{b.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${b.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}`}>
                  {b.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{b.address}, {b.city}</p>
              <p className="text-xs text-muted-foreground">{b.email} · {b.phone}</p>
              <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">ID: {b.id}</p>
            </div>
          ))}
        </div>
      </PageCard>

      {/* New branch form */}
      {showNew && (
        <PageCard title="Set Up New Branch">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Academy Name *</label>
              <input value={form.name} onChange={e => {
                const name = e.target.value;
                setForm({...form, name, id_slug: slugify(name)});
              }} placeholder="e.g. Westlands Arts Academy"
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Branch ID (auto) *</label>
              <input value={form.id_slug} onChange={e => setForm({...form, id_slug: e.target.value})}
                placeholder="westlands-arts" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono"/>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">City</label>
              <input value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Address</label>
              <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                placeholder="Street, Area" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                placeholder="+2547…" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Academy Email</label>
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                placeholder="info@newacademy.ke" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
            </div>
            <div className="sm:col-span-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Admin Account for New Branch</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Admin Email *</label>
                  <input value={form.admin_email} onChange={e => setForm({...form, admin_email: e.target.value})}
                    placeholder="admin@newacademy.ke" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Admin Password *</label>
                  <input type="password" value={form.admin_password} onChange={e => setForm({...form, admin_password: e.target.value})}
                    placeholder="min 6 characters" className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2 border-t border-border pt-3">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Copy course structure from</label>
              <select value={form.copy_from} onChange={e => setForm({...form, copy_from: e.target.value})}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option value="">— Start fresh (no courses) —</option>
                {(branches ?? []).map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Courses are copied as templates — no students, no data, just the course structure.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
            <button onClick={createBranch} disabled={creating}
              className="px-6 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50 flex items-center gap-2">
              {creating ? "Creating…" : "🏛️ Create Branch"}
            </button>
          </div>
        </PageCard>
      )}
    </div>
  );
}

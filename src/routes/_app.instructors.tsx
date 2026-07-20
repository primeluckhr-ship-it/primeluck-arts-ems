import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Pencil, Phone, Mail, BookOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/instructors")({ component: InstructorsPage });

const STATUS_COLORS: Record<string,string> = {
  active:   "bg-success/15 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

function InstructorsPage() {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  async function deleteInstructor(inst: any) {
    if (!confirm(`Delete instructor ${inst.first_name} ${inst.last_name}? Their course assignments will be cleared.`)) return;
    try {
      // Clear FK references on courses first to avoid constraint violation
      await supabase.from("courses").update({ instructor_id: null }).eq("instructor_id", inst.id);
      await supabase.from("fund_requests").update({ instructor_id: null }).eq("instructor_id", inst.id);
      // Also clear from lesson_plans
      await supabase.from("lesson_plans").update({ instructor_id: null }).eq("instructor_id", inst.id);
      const { error } = await supabase.from("instructors").delete().eq("id", inst.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["instructors-list"], exact: false });
      qc.invalidateQueries({ queryKey: ["courses-list"], exact: false });
      toast.success(`${inst.first_name} ${inst.last_name} deleted`);
    } catch (e: any) {
      toast.error("Delete failed: " + e.message);
    }
  }
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["instructors-full", branch],
    queryFn: async () => {
      let instQ = supabase.from("instructors").select("*").order("first_name");
      if (branch) instQ = instQ.eq("branch_id", branch);
      const { data: insts } = await instQ;
      
      // Get course count per instructor
      const { data: courses } = await supabase.from("courses")
        .select("instructor_id,name").eq("status","active");

      return (insts??[]).map((i:any) => ({
        ...i,
        courses: (courses??[]).filter((c:any) => c.instructor_id === i.id),
      }));
    },
  });

  const active = (data??[]).filter((i:any) => i.status==="active").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-center">
          <div className="text-2xl font-bold text-success">{active}</div>
          <div className="text-xs text-muted-foreground">Active Instructors</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{data?.length??0}</div>
          <div className="text-xs text-muted-foreground">Total Staff</div>
        </div>
      </div>

      <PageCard title="Instructors" subtitle="Teaching staff across all courses"
        action={
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4"/>Add Instructor
          </button>
        }>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data??[]).map((inst:any) => (
            <div key={inst.id} className="rounded-xl border border-border bg-background p-4 space-y-3 hover:border-accent/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                    {inst.first_name?.[0]}{inst.last_name?.[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{inst.first_name} {inst.last_name}</div>
                    <Badge className={STATUS_COLORS[inst.status]??""}>{inst.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditing(inst); setOpen(true); }} className="p-1.5 rounded hover:bg-muted" title="Edit">
                    <Pencil className="size-4"/>
                  </button>
                  <button onClick={() => deleteInstructor(inst)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive" title="Delete instructor">
                    <Trash2 className="size-4"/>
                  </button>
                </div>
              </div>

              {/* Specializations */}
              {inst.specialization?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {inst.specialization.map((s:string) => (
                    <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium">{s}</span>
                  ))}
                </div>
              )}

              {/* Contact */}
              <div className="space-y-1">
                {inst.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="size-3.5 shrink-0"/>{inst.phone}
                  </div>
                )}
                {inst.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="size-3.5 shrink-0"/><span className="truncate">{inst.email}</span>
                  </div>
                )}
              </div>

              {/* Assigned courses */}
              {inst.courses?.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                    <BookOpen className="size-3.5"/>
                    <span>{inst.courses.length} active course{inst.courses.length!==1?"s":""}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {inst.courses.slice(0,3).map((c:any) => (
                      <span key={c.name} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.name}</span>
                    ))}
                    {inst.courses.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">+{inst.courses.length-3} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {!isLoading && !data?.length && (
            <p className="col-span-3 py-8 text-center text-muted-foreground">No instructors yet — add your first staff member</p>
          )}
        </div>
      </PageCard>

      {open && (
        <InstructorForm initial={editing} branch={branch ?? ""} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["instructors-full"] }); }}/>
      )}
    </div>
  );
}

const SPECIALIZATIONS = [
  "Watercolour","Oil Painting","Acrylic","Sketching & Drawing",
  "Sculpture","Digital Art","Photography","Guitar","Piano",
  "Vocals","Drums","Art History","Mixed Media","Crafts",
];

function InstructorForm({ initial, branch, onClose, onSaved }: { initial:any; branch:string; onClose:()=>void; onSaved:()=>void }) {
  const [form, setForm] = useState({
    first_name: initial?.first_name??"",
    last_name:  initial?.last_name??"",
    email:      initial?.email??"",
    phone:      initial?.phone??"",
    bio:        initial?.bio??"",
    status:     initial?.status??"active",
    specialization: initial?.specialization??[] as string[],
  });
  const [saving, setSaving] = useState(false);

  function toggleSpec(s:string) {
    setForm(f => ({
      ...f,
      specialization: f.specialization.includes(s)
        ? f.specialization.filter((x:string)=>x!==s)
        : [...f.specialization, s],
    }));
  }

  async function save() {
    if (!form.first_name||!form.last_name) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      if (initial) {
        const { error } = await supabase.from("instructors").update(form).eq("id", initial.id);
        if (error) throw error;
        toast.success("Instructor updated");
      } else {
        const { error } = await supabase.from("instructors").insert({ ...form, id: crypto.randomUUID(), branch_id: branch });
        if (error) throw error;
        toast.success("Instructor added");
      }
      onSaved();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial?"Edit Instructor":"New Instructor"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name} onChange={(v)=>setForm({...form,first_name:v})}/></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v)=>setForm({...form,last_name:v})}/></Field>
          <Field label="Email" className="sm:col-span-2"><Input value={form.email} onChange={(v)=>setForm({...form,email:v})}/></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(v)=>setForm({...form,phone:v})} placeholder="+2547..."/></Field>
          <Field label="Status" className="sm:col-span-2">
            <div className="flex gap-2">
              {["active","inactive"].map((s)=>(
                <button key={s} type="button" onClick={()=>setForm({...form,status:s})}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border capitalize transition-all ${form.status===s?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Specializations" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {SPECIALIZATIONS.map((s)=>(
                <button key={s} type="button" onClick={()=>toggleSpec(s)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-all ${form.specialization.includes(s)?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground hover:border-accent"}`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Bio / Notes" className="sm:col-span-2">
            <textarea value={form.bio} onChange={(e)=>setForm({...form,bio:e.target.value})}
              rows={3} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"
              placeholder="Brief background, experience, teaching style…"/>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

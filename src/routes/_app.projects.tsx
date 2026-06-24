import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, Pencil, Target, CheckCircle2, Clock, Circle } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/projects")({ component: ProjectsPage });

const STATUS_COLORS: Record<string, string> = {
  planning:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  active:     "bg-success/15 text-success border-success/30",
  completed:  "bg-muted text-muted-foreground border-border",
  cancelled:  "bg-danger/15 text-danger border-danger/30",
};
const MILESTONE_ICONS: Record<string, React.ReactNode> = {
  pending:     <Circle className="size-4 text-muted-foreground"/>,
  in_progress: <Clock className="size-4 text-warning"/>,
  completed:   <CheckCircle2 className="size-4 text-success"/>,
};
const CATEGORY_LABELS: Record<string, string> = {
  event:"Event", exhibition:"Exhibition", competition:"Competition",
  community:"Community", school_programme:"School Programme", other:"Other",
};

function ProjectsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const qc = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects-list", user?.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from("projects")
        .select("*,instructors(first_name,last_name),dice_institutions(name)")
        .eq("branch_id", user?.branch_id ?? "")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (selected) return <ProjectDetail project={selected} onBack={() => setSelected(null)} />;

  const active    = (projects ?? []).filter((p: any) => p.status === "active");
  const planning  = (projects ?? []).filter((p: any) => p.status === "planning");
  const completed = (projects ?? []).filter((p: any) => p.status === "completed");

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"Active",    count: active.length,    cls:"bg-success/15 text-success border-success/30" },
          { label:"Planning",  count: planning.length,  cls:"bg-blue-500/15 text-blue-400 border-blue-500/30" },
          { label:"Completed", count: completed.length, cls:"bg-muted text-muted-foreground border-border" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${s.cls}`}>
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      <PageCard title="Projects & Events"
        action={
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4"/>New Project
          </button>
        }>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {(projects ?? []).map((p: any) => (
            <button key={p.id} onClick={() => setSelected(p)}
              className="text-left rounded-xl border border-border bg-background hover:border-accent/50 p-4 space-y-2 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-accent shrink-0"/>
                  <span className="font-semibold text-sm">{p.title}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Badge className={STATUS_COLORS[p.status]}>{p.status}</Badge>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(p); setOpen(true); }}
                    className="p-1 rounded hover:bg-muted"><Pencil className="size-3"/></button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[p.category] ?? p.category}</div>
              {p.dice_institutions?.name && (
                <div className="text-xs text-accent">📍 {p.dice_institutions.name}</div>
              )}
              <div className="flex gap-3 text-xs text-muted-foreground">
                {p.start_date && <span>From {p.start_date}</span>}
                {p.end_date   && <span>To {p.end_date}</span>}
                {p.budget     && <span>{formatKES(p.budget)} budget</span>}
              </div>
              {p.instructors && (
                <div className="text-xs text-muted-foreground">
                  Lead: {p.instructors.first_name} {p.instructors.last_name}
                </div>
              )}
            </button>
          ))}
          {!isLoading && !projects?.length && (
            <p className="col-span-2 py-8 text-center text-muted-foreground">No projects yet — create your first one</p>
          )}
        </div>
      </PageCard>

      {open && (
        <ProjectForm initial={editing} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["projects-list"] }); }}/>
      )}
    </div>
  );
}

function ProjectDetail({ project, onBack }: { project: any; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openMilestone, setOpenMilestone] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ title: "", due_date: "", status: "pending", notes: "" });
  const [saving, setSaving] = useState(false);

  const { data: milestones } = useQuery({
    queryKey: ["milestones", project.id],
    queryFn: async () => (await supabase.from("project_milestones").select("*").eq("project_id", project.id).order("due_date")).data ?? [],
  });

  async function saveMilestone() {
    setSaving(true);
    try {
      const { error } = await supabase.from("project_milestones").insert({ ...milestoneForm, project_id: project.id });
      if (error) throw error;
      toast.success("Milestone added");
      setOpenMilestone(false);
      setMilestoneForm({ title: "", due_date: "", status: "pending", notes: "" });
      qc.invalidateQueries({ queryKey: ["milestones", project.id] });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function toggleMilestone(m: any) {
    const next = m.status === "completed" ? "pending" : m.status === "pending" ? "in_progress" : "completed";
    await supabase.from("project_milestones").update({ status: next }).eq("id", m.id);
    qc.invalidateQueries({ queryKey: ["milestones", project.id] });
  }

  const done = (milestones ?? []).filter((m: any) => m.status === "completed").length;
  const total = milestones?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
        <div className="flex-1">
          <h2 className="font-semibold">{project.title}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge className={STATUS_COLORS[project.status]}>{project.status}</Badge>
            <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[project.category]}</span>
          </div>
        </div>
      </div>

      {project.description && (
        <PageCard>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </PageCard>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {project.start_date && <div className="rounded-lg border border-border p-3 text-center"><div className="text-xs text-muted-foreground">Start</div><div className="font-semibold text-sm mt-1">{project.start_date}</div></div>}
        {project.end_date   && <div className="rounded-lg border border-border p-3 text-center"><div className="text-xs text-muted-foreground">End</div><div className="font-semibold text-sm mt-1">{project.end_date}</div></div>}
        {project.budget     && <div className="rounded-lg border border-border p-3 text-center"><div className="text-xs text-muted-foreground">Budget</div><div className="font-semibold text-sm mt-1 text-accent">{formatKES(project.budget)}</div></div>}
      </div>

      <PageCard title={`Milestones ${total ? `(${done}/${total})` : ""}`}
        action={
          <button onClick={() => setOpenMilestone(true)}
            className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
            <Plus className="size-4"/>Add
          </button>
        }>
        {total > 0 && (
          <div className="w-full bg-muted rounded-full h-1.5 mb-4">
            <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${total ? (done/total)*100 : 0}%` }}/>
          </div>
        )}
        <div className="space-y-2">
          {(milestones ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <button onClick={() => toggleMilestone(m)} className="shrink-0">{MILESTONE_ICONS[m.status]}</button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${m.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{m.title}</div>
                {m.due_date && <div className="text-xs text-muted-foreground">Due: {m.due_date}</div>}
                {m.notes    && <div className="text-xs text-muted-foreground mt-0.5">{m.notes}</div>}
              </div>
              <Badge className={m.status === "completed" ? "bg-success/15 text-success border-success/30" : m.status === "in_progress" ? "bg-warning/15 text-warning border-warning/30" : "bg-muted text-muted-foreground border-border"}>
                {m.status.replace("_"," ")}
              </Badge>
            </div>
          ))}
          {!milestones?.length && <p className="py-4 text-center text-muted-foreground text-sm">No milestones yet — click Add to track progress</p>}
        </div>
      </PageCard>

      {openMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Add Milestone</h2>
            <div className="space-y-3">
              <Field label="Title"><Input value={milestoneForm.title} onChange={(v) => setMilestoneForm({...milestoneForm,title:v})}/></Field>
              <Field label="Due date"><Input type="date" value={milestoneForm.due_date} onChange={(v) => setMilestoneForm({...milestoneForm,due_date:v})}/></Field>
              <Field label="Notes">
                <textarea value={milestoneForm.notes} onChange={(e) => setMilestoneForm({...milestoneForm,notes:e.target.value})}
                  rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpenMilestone(false)} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
              <button onClick={saveMilestone} disabled={saving||!milestoneForm.title}
                className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
                {saving?"Saving…":"Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const isDice = user?.branch_id === "dice-arts-nairobi";

  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? (isDice ? "school_programme" : "event"),
    status: initial?.status ?? "planning",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    venue: initial?.venue ?? "",
    budget: initial?.budget ?? "",
    lead_instructor_id: initial?.lead_instructor_id ?? "",
    dice_institution_id: initial?.dice_institution_id ?? "",
  });
  const [saving, setSaving] = useState(false);

  const { data: instructors } = useQuery({
    queryKey: ["instructors-list"],
    queryFn: async () => (await supabase.from("instructors").select("id,first_name,last_name").eq("status","active").order("first_name")).data ?? [],
  });
  const { data: diceInstitutions } = useQuery({
    queryKey: ["dice-institutions"],
    enabled: isDice,
    queryFn: async () => (await supabase.from("dice_institutions").select("id,name").eq("is_active",true).order("name")).data ?? [],
  });

  async function save() {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, branch_id: user?.branch_id ?? "", created_by: user?.id,
        budget: form.budget ? Number(form.budget) : null,
        lead_instructor_id: form.lead_instructor_id || null,
        dice_institution_id: form.dice_institution_id || null,
        start_date: form.start_date || null, end_date: form.end_date || null };
      if (initial) {
        const { error } = await supabase.from("projects").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Project updated");
      } else {
        const { error } = await supabase.from("projects").insert(payload);
        if (error) throw error;
        toast.success("Project created");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Project" : "New Project"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(v) => setForm({...form,title:v})}/></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({...form,category:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              {isDice
                ? <><option value="school_programme">School Programme</option><option value="event">Event</option><option value="exhibition">Exhibition</option><option value="other">Other</option></>
                : <><option value="event">Event</option><option value="exhibition">Exhibition</option><option value="competition">Competition</option><option value="community">Community</option><option value="other">Other</option></>
              }
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({...form,status:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="planning">Planning</option><option value="active">Active</option>
              <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Start date"><Input type="date" value={form.start_date} onChange={(v) => setForm({...form,start_date:v})}/></Field>
          <Field label="End date"><Input type="date" value={form.end_date} onChange={(v) => setForm({...form,end_date:v})}/></Field>
          <Field label="Venue" className="sm:col-span-2"><Input value={form.venue} onChange={(v) => setForm({...form,venue:v})}/></Field>
          <Field label="Budget (KES)"><Input type="number" value={form.budget} onChange={(v) => setForm({...form,budget:v})}/></Field>
          <Field label="Lead instructor">
            <select value={form.lead_instructor_id} onChange={(e) => setForm({...form,lead_instructor_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— None —</option>
              {(instructors ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>)}
            </select>
          </Field>
          {isDice && (
            <Field label="Institution" className="sm:col-span-2">
              <select value={form.dice_institution_id} onChange={(e) => setForm({...form,dice_institution_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option value="">— No institution —</option>
                {(diceInstitutions ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Description" className="sm:col-span-2">
            <textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})}
              rows={3} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
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

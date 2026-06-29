import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES, getStatusColor } from "@/lib/pla";
import { Plus, Pencil, Users, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/courses")({ component: CoursesPage });

const CATEGORIES = ["Drawing","Painting","Watercolour","Oil Painting","Acrylic","Sculpture",
  "Digital Art","Photography","Mixed Media","Craft","Guitar","Piano","Vocals","Drums","General"];

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function CoursesPage() {
  const { user, activeBranch } = useAuth();
  const [view, setView] = useState<"grid"|"schedule">("grid");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const qc = useQueryClient();

  async function deleteCourse(course: any) {
    // Check enrollments first
    const { count } = await supabase.from("course_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id)
      .eq("status", "active");
    if ((count ?? 0) > 0) {
      if (!confirm(`"${course.name}" has ${count} active student(s) enrolled. Deleting will remove all enrolments. Continue?`)) return;
    } else {
      if (!confirm(`Delete course "${course.name}"? This cannot be undone.`)) return;
    }
    try {
      // Clear / delete all FK references before deleting course
      await supabase.from("attendance_charges").delete().eq("course_id", course.id);
      await supabase.from("course_enrollments").delete().eq("course_id", course.id);
      await supabase.from("student_progress_reports").delete().eq("course_id", course.id);
      // Get sessions for this course so we can delete their attendance records too
      const { data: courseSessions } = await supabase.from("sessions").select("id").eq("course_id", course.id);
      if (courseSessions?.length) {
        const sessionIds = courseSessions.map((s: any) => s.id);
        await supabase.from("attendance_records").delete().in("session_id", sessionIds);
        await supabase.from("lesson_plans").update({ session_id: null }).in("session_id", sessionIds);
      }
      await supabase.from("sessions").delete().eq("course_id", course.id);
      await supabase.from("lesson_plans").update({ course_id: null }).eq("course_id", course.id);
      await supabase.from("projects").update({ course_id: null }).eq("course_id", course.id);
      await supabase.from("institutions").update({ course_id: null }).eq("course_id", course.id);
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
      logAudit({ user_id: user?.id, branch_id: course.branch_id, action: "DELETE", entity_type: "course", entity_id: course.id, description: `Course deleted: "${course.name}"` });
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success(`"${course.name}" deleted`);
    } catch (err: any) {
      toast.error("Could not delete course: " + err.message);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["courses-list", user?.role === "super_admin" ? activeBranch : user?.branch_id, user?.role],
    queryFn: async () => {
      let q = supabase.from("courses")
        .select("*,instructors(first_name,last_name),course_enrollments(id)")
        .order("name");
      const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
      if (branch) q = q.eq("branch_id", branch);
      return (await q).data ?? [];
    },
  });

  const active = (data ?? []).filter((c: any) => c.status === "active");
  const isAdmin = ["super_admin","finance_admin","dice_admin"].includes(user?.role ?? "");
  const canEdit = isAdmin || user?.role === "teacher" || user?.role === "instructor";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-accent">{active.length}</div>
          <div className="text-xs text-muted-foreground">Active Courses</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{(data??[]).reduce((s:number,c:any)=>s+(c.course_enrollments?.length??0),0)}</div>
          <div className="text-xs text-muted-foreground">Total Enrollments</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{[...new Set((data??[]).map((c:any)=>c.category).filter(Boolean))].length}</div>
          <div className="text-xs text-muted-foreground">Categories</div>
        </div>
      </div>

      <PageCard
        title="Courses"
        subtitle={`${active.length} active`}
        action={
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["grid","schedule"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs capitalize ${view===v?"bg-accent text-accent-foreground":"text-muted-foreground hover:bg-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
            {canEdit && (
              <button onClick={() => { setEditing(null); setOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium">
                <Plus className="size-4"/>Add Course
              </button>
            )}
          </div>
        }
      >
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}

        {view === "grid" && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data??[]).map((c: any) => (
              <div key={c.id} className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{c.category || "General"}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge className={getStatusColor(c.status)}>{c.status}</Badge>
                    {canEdit && (
                      <>
                        <button onClick={() => { setEditing(c); setOpen(true); }} className="p-1 rounded hover:bg-muted" title="Edit">
                          <Pencil className="size-3.5"/>
                        </button>
                        <button onClick={() => deleteCourse(c)} className="p-1 rounded hover:bg-destructive/20 text-destructive" title="Delete course">
                          <Trash2 className="size-3.5"/>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {c.instructors && (
                  <div className="text-xs text-muted-foreground">
                    👤 {c.instructors.first_name} {c.instructors.last_name}
                  </div>
                )}

                <div className="flex flex-wrap gap-1">
                  {(c.schedule_days??[]).map((d:string) => (
                    <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">{d}</span>
                  ))}
                  {c.start_time && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                      <Clock className="size-2.5"/>{c.start_time.slice(0,5)}–{c.end_time?.slice(0,5)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="size-3.5"/>
                    <span>{c.course_enrollments?.length ?? 0}{c.max_students ? `/${c.max_students}` : ""} students</span>
                  </div>
                  <div className="font-semibold text-accent">
                    {c.per_session_billing
                      ? `${formatKES(c.session_fee??0)}/session`
                      : c.billing_cycle === "termly"
                        ? `${formatKES(c.term_fee??0)}/term`
                        : c.monthly_fee
                          ? `${formatKES(c.monthly_fee)}/mo`
                          : "—"}
                  </div>
                </div>
              </div>
            ))}
            {!isLoading && !data?.length && (
              <p className="col-span-3 py-8 text-center text-muted-foreground">No courses yet — add the first one</p>
            )}
          </div>
        )}

        {view === "schedule" && (
          <div className="grid grid-cols-7 gap-1 min-w-[560px] overflow-x-auto">
            {DAYS.map(day => (
              <div key={day} className="border border-border rounded-lg p-2 min-h-[120px]">
                <div className="text-xs font-bold text-accent text-center mb-2">{day}</div>
                {(data??[]).filter((c:any) => c.schedule_days?.includes(day)).map((c:any) => (
                  <div key={c.id} className="bg-accent/10 border border-accent/20 rounded p-1.5 mb-1 text-[10px]">
                    <div className="font-semibold text-accent truncate">{c.name}</div>
                    <div className="text-muted-foreground">{c.start_time?.slice(0,5)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {open && (
        <CourseForm
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["courses-list"], exact: false }); }}
        />
      )}
    </div>
  );
}

function CourseForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "General",
    room: initial?.room ?? "",
    max_students: initial?.max_students ?? "",
    start_time: initial?.start_time ?? "",
    end_time: initial?.end_time ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    schedule_days: (initial?.schedule_days ?? []).map((d: string) => {
      const map: Record<string,string> = { Monday:"Mon",Tuesday:"Tue",Wednesday:"Wed",Thursday:"Thu",Friday:"Fri",Saturday:"Sat",Sunday:"Sun" };
      return map[d] ?? d;
    }) as string[],
    status: initial?.status ?? "active",
    billing_cycle: initial?.billing_cycle ?? "monthly",
    monthly_fee: initial?.monthly_fee ?? "",
    term_fee: initial?.term_fee ?? "",
    per_session_billing: initial?.per_session_billing ?? false,
    session_fee: initial?.session_fee ?? "",
    instructor_id: initial?.instructor_id ?? "",
  });
  const [saving, setSaving] = useState(false);

  const { data: instructors } = useQuery({
    queryKey: ["instructors-active", user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("instructors").select("id,first_name,last_name").eq("status","active").order("first_name");
      const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
      if (branch) q = q.eq("branch_id", branch);
      return (await q).data ?? [];
    },
  });

  function toggleDay(d: string) {
    setForm(f => ({ ...f, schedule_days: f.schedule_days.includes(d) ? f.schedule_days.filter((x:string)=>x!==d) : [...f.schedule_days, d] }));
  }

  async function save() {
    if (!form.name) { toast.error("Course name required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        max_students: form.max_students ? Number(form.max_students) : null,
        monthly_fee: form.monthly_fee ? Number(form.monthly_fee) : null,
        term_fee: form.term_fee ? Number(form.term_fee) : null,
        session_fee: form.per_session_billing ? (Number(form.session_fee) || null) : null,
        instructor_id: form.instructor_id || null,
        branch_id: (user?.role === "super_admin" ? activeBranch : user?.branch_id) ?? "",
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      if (initial) {
        const { error } = await supabase.from("courses").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Course updated");
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
        toast.success("Course added");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Course" : "New Course"}</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Course name" className="sm:col-span-2"><Input value={form.name} onChange={v=>setForm({...form,name:v})}/></Field>

          <Field label="Category">
            <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Instructor">
            <select value={form.instructor_id} onChange={e=>setForm({...form,instructor_id:e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Unassigned —</option>
              {(instructors??[]).map((i:any)=><option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>)}
            </select>
          </Field>

          <Field label="Room / Location"><Input value={form.room} onChange={v=>setForm({...form,room:v})} placeholder="e.g. Studio A"/></Field>
          <Field label="Max students"><Input type="number" value={String(form.max_students)} onChange={v=>setForm({...form,max_students:v})}/></Field>

          <Field label="Start time"><Input type="time" value={form.start_time} onChange={v=>setForm({...form,start_time:v})}/></Field>
          <Field label="End time"><Input type="time" value={form.end_time} onChange={v=>setForm({...form,end_time:v})}/></Field>

          <Field label="Schedule days" className="sm:col-span-2">
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map(d=>(
                <button key={d} type="button" onClick={()=>toggleDay(d)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.schedule_days.includes(d)?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground hover:border-accent"}`}>
                  {d}
                </button>
              ))}
            </div>
          </Field>

          {/* Billing */}
          <Field label="Billing type" className="sm:col-span-2">
            <div className="flex gap-2">
              {[
                {v:"monthly",l:"Monthly"},
                {v:"termly",l:"Termly"},
                {v:"per_session",l:"Per Session"},
              ].map(({v,l})=>(
                <button key={v} type="button"
                  onClick={()=>setForm({...form, billing_cycle:v, per_session_billing: v==="per_session"})}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border transition-all ${form.billing_cycle===v?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </Field>

          {form.billing_cycle === "monthly" && (
            <Field label="Monthly fee (KES)" className="sm:col-span-2">
              <Input type="number" value={String(form.monthly_fee)} onChange={v=>setForm({...form,monthly_fee:v})}/>
            </Field>
          )}
          {form.billing_cycle === "termly" && (
            <Field label="Term fee (KES)" className="sm:col-span-2">
              <Input type="number" value={String(form.term_fee)} onChange={v=>setForm({...form,term_fee:v})}/>
            </Field>
          )}
          {form.billing_cycle === "per_session" && (
            <Field label="Fee per session (KES)" className="sm:col-span-2">
              <Input type="number" value={String(form.session_fee)} onChange={v=>setForm({...form,session_fee:v})}/>
            </Field>
          )}

          <Field label="Status" className="sm:col-span-2">
            <div className="flex gap-2">
              {["active","inactive","completed"].map(s=>(
                <button key={s} type="button" onClick={()=>setForm({...form,status:s})}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border capitalize transition-all ${form.status===s?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving?"Saving…":"Save Course"}
          </button>
        </div>
      </div>
    </div>
  );
}

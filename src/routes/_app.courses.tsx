import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, Pencil, Clock, Users, Zap, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/courses")({ component: CoursesPage });

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const STATUS_COLORS: Record<string,string> = {
  active:    "bg-success/15 text-success border-success/30",
  inactive:  "bg-muted text-muted-foreground border-border",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function CoursesPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [view, setView] = useState<"grid"|"schedule">("grid");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["courses-full", user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("courses")
        .select("*,programs(name,monthly_fee,term_fee,billing_cycle),instructors(first_name,last_name),course_enrollments(id)")
        .order("name");
      if (user?.role === "teacher" || user?.role === "instructor") {
        const { data: inst } = await supabase.from("instructors").select("id").eq("email", user.email).limit(1);
        if (inst?.[0]) q = q.eq("instructor_id", inst[0].id);
      }
      return (await q).data ?? [];
    },
  });

  const active   = (data??[]).filter((c:any) => c.status==="active");
  const inactive = (data??[]).filter((c:any) => c.status!=="active");

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-center">
          <div className="text-2xl font-bold text-success">{active.length}</div>
          <div className="text-xs text-muted-foreground">Active Courses</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{(data??[]).reduce((s:number,c:any)=>s+(c.course_enrollments?.length??0),0)}</div>
          <div className="text-xs text-muted-foreground">Total Enrolled</div>
        </div>
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-center">
          <div className="text-2xl font-bold text-accent">{(data??[]).filter((c:any)=>c.per_session_billing).length}</div>
          <div className="text-xs text-muted-foreground">Per-Session Billing</div>
        </div>
      </div>

      <PageCard title="Courses" subtitle={`${data?.length??0} total`}
        action={
          <div className="flex gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["grid","schedule"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs capitalize ${view===v?"bg-accent text-accent-foreground":"text-muted-foreground hover:bg-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
            {(user?.role==="super_admin"||user?.role==="dice_admin") && (
              <button onClick={() => { setEditing(null); setOpen(true); }}
                className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
                <Plus className="size-4"/>New Course
              </button>
            )}
          </div>
        }>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}

        {view==="grid" && (
          <div className="grid md:grid-cols-2 gap-4">
            {(data??[]).map((c:any) => (
              <div key={c.id} className="rounded-xl border border-border bg-background p-4 space-y-3 hover:border-accent/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="size-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                      <BookOpen className="size-4"/>
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.programs?.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge className={STATUS_COLORS[c.status]??""}>{c.status}</Badge>
                    {(user?.role==="super_admin"||user?.role==="dice_admin") && (
                      <button onClick={() => { setEditing(c); setOpen(true); }} className="p-1.5 rounded hover:bg-muted ml-1"><Pencil className="size-3.5"/></button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-3.5"/>
                    <span>{c.course_enrollments?.length??0} / {c.max_students??"∞"} students</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-3.5"/>
                    <span>{c.start_time?.slice(0,5)} – {c.end_time?.slice(0,5)}</span>
                  </div>
                </div>

                {c.schedule_days?.length > 0 && (
                  <div className="flex gap-1">
                    {DAYS.map((d) => (
                      <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.schedule_days?.includes(d)?"bg-accent text-accent-foreground":"bg-muted text-muted-foreground"}`}>{d}</span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    {c.instructors ? `${c.instructors.first_name} ${c.instructors.last_name}` : "No instructor"}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.per_session_billing && (
                      <span className="inline-flex items-center gap-1 text-xs text-accent bg-accent/10 border border-accent/20 rounded px-2 py-0.5">
                        <Zap className="size-3"/>
                        {formatKES(c.session_fee??0)}/session
                      </span>
                    )}
                    {!c.per_session_billing && c.programs && (
                      <span className="text-xs text-muted-foreground">
                        {c.programs.billing_cycle==="termly"
                          ? formatKES(c.programs.term_fee??0)+"/term"
                          : formatKES(c.programs.monthly_fee??0)+"/mo"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!isLoading && !data?.length && (
              <p className="col-span-2 py-8 text-center text-muted-foreground">No courses yet — add your first course</p>
            )}
          </div>
        )}

        {view==="schedule" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Course</th>
                  <th className="py-2 pr-3">Days</th>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Room</th>
                  <th className="py-2 pr-3">Instructor</th>
                  <th className="py-2 pr-3">Students</th>
                  <th className="py-2">Billing</th>
                </tr>
              </thead>
              <tbody>
                {active.map((c:any) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 pr-3 font-medium">{c.name}</td>
                    <td className="py-2.5 pr-3 text-xs">{c.schedule_days?.join(", ")??""}</td>
                    <td className="py-2.5 pr-3 text-xs">{c.start_time?.slice(0,5)} – {c.end_time?.slice(0,5)}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{c.room||"—"}</td>
                    <td className="py-2.5 pr-3">{c.instructors ? `${c.instructors.first_name} ${c.instructors.last_name}` : "—"}</td>
                    <td className="py-2.5 pr-3">{c.course_enrollments?.length??0}</td>
                    <td className="py-2.5">
                      {c.per_session_billing
                        ? <span className="text-accent text-xs">{formatKES(c.session_fee??0)}/session</span>
                        : <span className="text-muted-foreground text-xs">{c.programs?.billing_cycle==="termly"?"Termly":"Monthly"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      {open && (
        <CourseForm initial={editing} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["courses-full"] }); }}/>
      )}
    </div>
  );
}

function CourseForm({ initial, onClose, onSaved }: { initial:any; onClose:()=>void; onSaved:()=>void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: initial?.name??"",
    program_id: initial?.program_id??"",
    instructor_id: initial?.instructor_id??"",
    room: initial?.room??"",
    max_students: initial?.max_students??"",
    start_time: initial?.start_time?.slice(0,5)??"09:00",
    end_time: initial?.end_time?.slice(0,5)??"10:00",
    schedule_days: initial?.schedule_days??[] as string[],
    status: initial?.status??"active",
    per_session_billing: initial?.per_session_billing??false,
    session_fee: initial?.session_fee??"",
  });
  const [saving, setSaving] = useState(false);

  const { data: programs } = useQuery({ queryKey:["programs-list"], queryFn: async () => (await supabase.from("programs").select("id,name,monthly_fee,term_fee,billing_cycle").eq("status","active").order("name")).data??[] });
  const { data: instructors } = useQuery({ queryKey:["instructors-active"], queryFn: async () => (await supabase.from("instructors").select("id,first_name,last_name").eq("status","active").order("first_name")).data??[] });

  function toggleDay(d:string) {
    setForm(f => ({ ...f, schedule_days: f.schedule_days.includes(d) ? f.schedule_days.filter((x:string)=>x!==d) : [...f.schedule_days, d] }));
  }

  async function save() {
    if (!form.name) { toast.error("Course name required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        max_students: form.max_students ? Number(form.max_students) : null,
        session_fee: form.per_session_billing ? (Number(form.session_fee)||null) : null,
        program_id: form.program_id||null,
        instructor_id: form.instructor_id||null,
        branch_id: user?.branch_id??"",
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
        toast.success("Course created");
      }
      onSaved();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial?"Edit Course":"New Course"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Course name" className="sm:col-span-2"><Input value={form.name} onChange={(v)=>setForm({...form,name:v})}/></Field>
          <Field label="Program">
            <select value={form.program_id} onChange={(e)=>setForm({...form,program_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— None —</option>
              {(programs??[]).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Instructor">
            <select value={form.instructor_id} onChange={(e)=>setForm({...form,instructor_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— None —</option>
              {(instructors??[]).map((i:any)=><option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>)}
            </select>
          </Field>
          <Field label="Start time"><Input type="time" value={form.start_time} onChange={(v)=>setForm({...form,start_time:v})}/></Field>
          <Field label="End time"><Input type="time" value={form.end_time} onChange={(v)=>setForm({...form,end_time:v})}/></Field>
          <Field label="Room"><Input value={form.room} onChange={(v)=>setForm({...form,room:v})} placeholder="e.g. Studio A"/></Field>
          <Field label="Max students"><Input type="number" value={form.max_students} onChange={(v)=>setForm({...form,max_students:v})}/></Field>
          <Field label="Schedule days" className="sm:col-span-2">
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d)=>(
                <button key={d} type="button" onClick={()=>toggleDay(d)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${form.schedule_days.includes(d)?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground hover:border-accent"}`}>
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="completed">Completed</option>
            </select>
          </Field>

          {/* Per-session billing toggle */}
          <Field label="Per-session billing" className="sm:col-span-2">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
              <button type="button" onClick={()=>setForm({...form,per_session_billing:!form.per_session_billing})}
                className={`relative w-10 h-6 rounded-full transition-colors ${form.per_session_billing?"bg-accent":"bg-muted"}`}>
                <span className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ${form.per_session_billing?"translate-x-4":""}`}/>
              </button>
              <div>
                <div className="text-sm font-medium">Charge per session attended</div>
                <div className="text-xs text-muted-foreground">When ON, students are charged each time marked Present</div>
              </div>
            </div>
          </Field>
          {form.per_session_billing && (
            <Field label="Fee per session (KES)" className="sm:col-span-2">
              <Input type="number" value={form.session_fee} onChange={(v)=>setForm({...form,session_fee:v})} placeholder="e.g. 500"/>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

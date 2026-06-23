import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/courses")({
  component: CoursesPage,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CoursesPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<"cards" | "grid">("cards");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["courses-list"],
    queryFn: async () => {
      const [{ data: courses }, { data: counts }] = await Promise.all([
        supabase.from("courses").select("*,programs(name,monthly_fee),instructors(first_name,last_name)").order("created_at", { ascending: false }),
        supabase.from("course_enrollments").select("course_id"),
      ]);
      return (courses ?? []).map((c: any) => ({ ...c, enrolled: (counts ?? []).filter((e: any) => e.course_id === c.id).length }));
    },
  });

  return (
    <div className="space-y-4">
      <PageCard
        title="Courses & Schedule"
        subtitle={`${data?.length ?? 0} courses`}
        action={
          <div className="flex gap-2">
            <div className="bg-muted rounded-md p-0.5 flex">
              <button onClick={() => setView("cards")} className={`px-3 py-1 text-xs rounded ${view === "cards" ? "bg-card" : ""}`}>Cards</button>
              <button onClick={() => setView("grid")} className={`px-3 py-1 text-xs rounded ${view === "grid" ? "bg-card" : ""}`}>Schedule</button>
            </div>
            <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Add</button>
          </div>
        }
      >
        {view === "cards" ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data ?? []).map((c: any) => (
              <div key={c.id} className="border border-border rounded-lg p-4 bg-background/30">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <Badge className="bg-accent/15 text-accent border-accent/30 mt-1">{c.programs?.name}</Badge>
                  </div>
                  <button onClick={() => { setEditing(c); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="size-4" /></button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  <div>👤 {c.instructors?.first_name} {c.instructors?.last_name}</div>
                  <div>📅 {(c.schedule_days ?? []).join(", ")}</div>
                  <div>⏰ {c.start_time?.slice(0, 5)} – {c.end_time?.slice(0, 5)}</div>
                  <div>📍 Room {c.room || "—"}</div>
                  <div>👥 {c.enrolled}/{c.max_students || "∞"} enrolled</div>
                </div>
              </div>
            ))}
            {!data?.length && <div className="md:col-span-3 text-center py-8 text-muted-foreground">No courses.</div>}
          </div>
        ) : (
          <ScheduleGrid courses={data ?? []} />
        )}
      </PageCard>

      {open && <CourseForm initial={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["courses-list"] }); }} />}
    </div>
  );
}

function ScheduleGrid({ courses }: { courses: any[] }) {
  const slots = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
        <div></div>
        {DAYS.map((d) => <div key={d} className="text-center text-xs font-semibold py-2 border-b border-border">{d}</div>)}
        {slots.map((slot) => (
          <>
            <div key={slot} className="text-xs text-muted-foreground py-3 pr-2 text-right">{slot}</div>
            {DAYS.map((d) => {
              const matches = courses.filter((c) => (c.schedule_days ?? []).includes(d) && c.start_time?.slice(0, 5) >= slot && c.start_time?.slice(0, 5) < addHours(slot, 2));
              return (
                <div key={d + slot} className="border border-border/40 min-h-[64px] p-1">
                  {matches.map((c) => (
                    <div key={c.id} className="text-[10px] bg-accent/15 text-accent rounded px-1.5 py-1 mb-1">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="opacity-80">{c.start_time?.slice(0, 5)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
function addHours(t: string, h: number) {
  const [hh, mm] = t.split(":").map(Number);
  const total = hh + h;
  return `${String(total).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function CourseForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { data: programs } = useQuery({ queryKey: ["programs-opt"], queryFn: async () => (await supabase.from("programs").select("id,name")).data ?? [] });
  const { data: instructors } = useQuery({ queryKey: ["instructors-opt"], queryFn: async () => (await supabase.from("instructors").select("id,first_name,last_name")).data ?? [] });
  const { data: branches } = useQuery({ queryKey: ["branches-opt"], queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [] });

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    program_id: initial?.program_id ?? "",
    instructor_id: initial?.instructor_id ?? "",
    branch_id: initial?.branch_id ?? "",
    schedule_days: initial?.schedule_days ?? [],
    start_time: initial?.start_time ?? "10:00",
    end_time: initial?.end_time ?? "11:30",
    room: initial?.room ?? "",
    max_students: initial?.max_students ?? 20,
    status: initial?.status ?? "active",
  });
  const [saving, setSaving] = useState(false);

  function toggleDay(d: string) {
    setForm((f) => ({ ...f, schedule_days: f.schedule_days.includes(d) ? f.schedule_days.filter((x: string) => x !== d) : [...f.schedule_days, d] }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload: any = { ...form, max_students: Number(form.max_students) || null };
      if (!payload.branch_id) delete payload.branch_id;
      if (initial) await supabase.from("courses").update(payload).eq("id", initial.id).throwOnError();
      else await supabase.from("courses").insert(payload).throwOnError();
      toast.success("Saved"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Add"} Course</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} /></Field>
          <Field label="Program">
            <select value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option>{(programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Instructor">
            <select value={form.instructor_id ?? ""} onChange={(e) => setForm({ ...form, instructor_id: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option>{(instructors ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select value={form.branch_id ?? ""} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option>{(branches ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Room"><Input value={form.room} onChange={(v) => setForm({ ...form, room: v })} /></Field>
          <Field label="Start time"><Input type="time" value={form.start_time} onChange={(v) => setForm({ ...form, start_time: v })} /></Field>
          <Field label="End time"><Input type="time" value={form.end_time} onChange={(v) => setForm({ ...form, end_time: v })} /></Field>
          <Field label="Max students"><Input type="number" value={String(form.max_students)} onChange={(v) => setForm({ ...form, max_students: Number(v) })} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>active</option><option>inactive</option>
            </select>
          </Field>
          <Field label="Schedule days" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button type="button" key={d} onClick={() => toggleDay(d)} className={`px-3 py-1.5 text-xs rounded border ${form.schedule_days.includes(d) ? "bg-accent text-accent-foreground border-accent" : "border-border"}`}>{d}</button>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus, BookOpen, Share2, MessageCircle, Calendar, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/lessons")({ component: LessonsPage });

function LessonsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [tab, setTab] = useState<"plans"|"reports">("plans");
  const qc = useQueryClient();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {([
          { key:"plans",   label:"Lesson Plans" },
          { key:"reports", label:"Progress Reports" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 ${tab===t.key?"border-accent text-accent":"border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab==="plans"   && <LessonPlansTab />}
      {tab==="reports" && <ProgressReportsTab />}
    </div>
  );
}

/* ── LESSON PLANS ── */
function LessonPlansTab() {
  const { user, activeBranch } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [courseFilter, setCourseFilter] = useState("all");
  const qc = useQueryClient();

  const branch = user?.role === "super_admin" ? (activeBranch ?? user?.branch_id) : user?.branch_id;

  const { data: coursesForFilter } = useQuery({
    queryKey: ["courses-filter", branch],
    queryFn: async () => (await supabase.from("courses").select("id,name").eq("branch_id", branch ?? "").eq("status","active").order("name").throwOnError()).data ?? [],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["lesson-plans", branch, courseFilter],
    queryFn: async () => {
      let q = supabase.from("lesson_plans")
        .select("*,courses(name,branch_id),instructors(first_name,last_name)")
        .eq("branch_id", branch ?? "")
        .order("lesson_date", { ascending: false });
      if (courseFilter !== "all") q = q.eq("course_id", courseFilter);
      return (await q.throwOnError()).data ?? [];
    },
  });

  return (
    <PageCard title="Lesson Plans"
      action={
        <button onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
          <Plus className="size-4"/>New Plan
        </button>
      }>
      <div className="mb-3">
        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}
          className="bg-background border border-input rounded-md px-3 py-2 text-sm w-full sm:w-auto">
          <option value="all">All Courses</option>
          {(coursesForFilter ?? []).map((co: any) => (
            <option key={co.id} value={co.id}>{co.name}</option>
          ))}
        </select>
      </div>
      {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
      <div className="space-y-3">
        {(data ?? []).map((plan: any) => (
          <div key={plan.id} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-accent shrink-0"/>
                <div>
                  <div className="font-semibold text-sm">{plan.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.courses?.name} · {plan.lesson_date}{plan.lesson_time ? " · " + plan.lesson_time.slice(0,5) : ""} · {plan.duration_minutes}min
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button onClick={() => { setEditing(plan); setOpen(true); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline">Edit</button>
                <GoogleCalendarSync plan={plan} />
                <WhatsAppSharePlan plan={plan} />
              </div>
            </div>
            {plan.notes && (
              <div className="mt-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent/80 italic">
                📝 {plan.notes}
              </div>
            )}
            {plan.objectives && (
              <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="font-medium text-accent mb-1">🎯 Objectives</div>
                  <p className="text-muted-foreground">{plan.objectives}</p>
                </div>
                {plan.materials && (
                  <div className="rounded-md bg-muted/50 p-2">
                    <div className="font-medium text-accent mb-1">📦 Materials</div>
                    <p className="text-muted-foreground">{plan.materials}</p>
                  </div>
                )}
                {plan.activities && (
                  <div className="rounded-md bg-muted/50 p-2 sm:col-span-2">
                    <div className="font-medium text-accent mb-1">🎨 Activities</div>
                    <p className="text-muted-foreground">{plan.activities}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {!isLoading && !data?.length && (
          <p className="py-8 text-center text-muted-foreground">No lesson plans yet — create your first one</p>
        )}
      </div>
      {open && (
        <LessonPlanForm initial={editing} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["lesson-plans"], exact: false }); }}/>
      )}
    </PageCard>
  );
}


function GoogleCalendarSync({ plan }: { plan: any }) {
  const { user } = useAuth();
  const isDice = (plan.courses?.branch_id ?? user?.branch_id) === "dice-arts-nairobi";
  const academyName  = isDice ? "Dice Arts Academy"    : "PrimeLuck Arts Academy";
  const academyEmail = isDice ? "dicearts.academy@gmail.com" : "primeluck.hr@gmail.com";

  function syncToCalendar() {
    if (!plan.lesson_date) { toast.error("Set a lesson date first"); return; }

    const date = plan.lesson_date.replace(/-/g, "");
    const durationMins = Number(plan.duration_minutes ?? 60);
    // Use lesson_time if stored, else default 9am
    // lesson_time from DB is "HH:MM:SS" — take first 5 chars "HH:MM" then strip colon
    const startHHMM = plan.lesson_time ? plan.lesson_time.slice(0,5).replace(":","") : "0900";
    const [startH, startM] = [parseInt(startHHMM.slice(0,2)), parseInt(startHHMM.slice(2,4))];
    const totalM = startH * 60 + startM + durationMins;
    const endHHMM = `${String(Math.floor(totalM/60)).padStart(2,"0")}${String(totalM%60).padStart(2,"0")}`;

    // Build structured lesson notes for calendar description
    const lines: string[] = [];
    if (plan.courses?.name) lines.push(`📚 Course: ${plan.courses.name}`);
    if (plan.duration_minutes) lines.push(`⏱ Duration: ${plan.duration_minutes} minutes`);
    if (plan.notes) lines.push(`📝 Summary: ${plan.notes}`);
    lines.push("");
    if (plan.objectives)  lines.push(`🎯 OBJECTIVES\n${plan.objectives}`);
    if (plan.materials)   lines.push(`\n📦 MATERIALS NEEDED\n${plan.materials}`);
    if (plan.activities)  lines.push(`\n🎨 ACTIVITIES\n${plan.activities}`);
    if (plan.homework)    lines.push(`\n📚 HOMEWORK\n${plan.homework}`);
    lines.push(`\n— Scheduled via ${academyName} EMS`);
    const description = lines.join("\n");

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `${plan.title}${plan.courses?.name ? ` — ${plan.courses.name}` : ""}`,
      dates: `${date}T${startHHMM}00/${date}T${endHHMM}00`,
      details: description,
      location: academyName,
      add: academyEmail,
    });
    window.open(`https://calendar.google.com/calendar/render?${params}`, "_blank");
  }

  return (
    <button onClick={syncToCalendar} title={`Schedule on Google Calendar — ${academyEmail}`}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20">
      <Calendar className="size-3"/>Calendar
    </button>
  );
}

function WhatsAppSharePlan({ plan }: { plan: any }) {
  function share() {
    const msg = `*Lesson Plan: ${plan.title}*\n\n📅 Date: ${plan.lesson_date}\n⏱ Duration: ${plan.duration_minutes} mins\n\n🎯 *Objectives*\n${plan.objectives ?? "—"}\n\n📦 *Materials Needed*\n${plan.materials ?? "—"}\n\n🎨 *Activities*\n${plan.activities ?? "—"}\n\n${plan.homework ? `📚 *Homework*\n${plan.homework}\n\n` : ""}Shared by ${plan.courses?.branch_id === "dice-arts-nairobi" ? "Dice Arts Academy 🎨" : "PrimeLuck Arts Academy 🎨"}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }
  return (
    <button onClick={share} title="Share via WhatsApp"
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/20">
      <MessageCircle className="size-3"/>Share
    </button>
  );
}

// TA is outside LessonPlanForm so React doesn't remount it on every render (fixes frozen textareas)
function TA({ label, field, form, setForm, rows = 3 }: {
  label: string; field: string;
  form: Record<string, any>; setForm: (f: any) => void;
  rows?: number;
}) {
  return (
    <Field label={label} className="sm:col-span-2">
      <textarea
        value={form[field] ?? ""}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        rows={rows}
        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"
        placeholder={`Enter ${label.toLowerCase()}…`}
      />
    </Field>
  );
}

function LessonPlanForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    course_id: initial?.course_id ?? "",
    instructor_id: initial?.instructor_id ?? (user?.linked_entity_id || ""),
    lesson_date: initial?.lesson_date ?? new Date().toISOString().slice(0, 10),
    lesson_time: initial?.lesson_time ?? "09:00",
    duration_minutes: initial?.duration_minutes ?? 60,
    objectives: initial?.objectives ?? "",
    materials: initial?.materials ?? "",
    activities: initial?.activities ?? "",
    homework: initial?.homework ?? "",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiOpen, setAiOpen] = useState(!initial); // open by default for new plans
  const [requestMaterials, setRequestMaterials] = useState(false);
  const [isProgressive, setIsProgressive] = useState(false);
  const [sessionCount, setSessionCount] = useState(2);
  const [matItems, setMatItems] = useState<{ name: string; qty: string; cost: string }[]>([
    { name: "", qty: "1", cost: "" }
  ]);
  const matTotal = matItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.cost) || 0), 0);

  function addMatItem() { setMatItems([...matItems, { name: "", qty: "1", cost: "" }]); }
  function removeMatItem(i: number) { setMatItems(matItems.filter((_, idx) => idx !== i)); }
  function updateMatItem(i: number, field: string, val: string) {
    setMatItems(matItems.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  async function generateWithAI() {
    if (!aiPrompt.trim()) { toast.error("Describe the lesson topic first"); return; }
    setAiGenerating(true);
    try {
      const { data: courses } = await supabase.from("courses")
        .select("id,name").eq("id", form.course_id).limit(1);
      const courseName = courses?.[0]?.name ?? "";

      // Call Supabase edge function proxy (keeps API key server-side)
      const res = await fetch("https://xgwfodwaczyrnxagyzhl.supabase.co/functions/v1/ai-lesson-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnd2ZvZHdhY3p5cm54YWd5emhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTk3MjksImV4cCI6MjA5NzY5NTcyOX0.5WYZgeUA6eVw9EOzu9qlA_FUKVIARnfcTDb8VyKNM7M",
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnd2ZvZHdhY3p5cm54YWd5emhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTk3MjksImV4cCI6MjA5NzY5NTcyOX0.5WYZgeUA6eVw9EOzu9qlA_FUKVIARnfcTDb8VyKNM7M",
        },
        body: JSON.stringify({
          topic: aiPrompt,
          courseName,
          duration: form.duration_minutes,
          branch: formBranch,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `Error ${res.status}`);
      const raw = json.plan;

      // Defensive normalizer — AI can return arrays or objects even when prompted for strings
      const toStr = (v: unknown, bullet = false): string => {
        if (!v) return "";
        if (typeof v === "string") return v.trim();
        if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
          .map((x) => bullet ? (x.startsWith("•") ? x : `• ${x}`) : x).join("\n");
        if (typeof v === "object") return Object.values(v as Record<string, unknown>)
          .map((x) => String(x).trim()).filter(Boolean)
          .map((x) => bullet ? (x.startsWith("•") ? x : `• ${x}`) : x).join("\n");
        return String(v).trim();
      };

      const plan = {
        title:      toStr(raw.title),
        objectives: toStr(raw.objectives, true),
        materials:  toStr(raw.materials,  true),
        activities: toStr(raw.activities),
        homework:   toStr(raw.homework),
        notes:      toStr(raw.notes),
      };

      // Build a compact notes summary from the AI content
      const autoNotes = [
        plan.objectives ? `Objectives: ${plan.objectives.slice(0, 120).replace(/•\s*/g, "").trim()}` : "",
        plan.activities ? `Activities: ${plan.activities.slice(0, 120).trim()}` : "",
      ].filter(Boolean).join(" | ");

      setForm(f => ({
        ...f,
        title:      plan.title      || f.title,
        objectives: plan.objectives || f.objectives,
        materials:  plan.materials  || f.materials,
        activities: plan.activities || f.activities,
        homework:   plan.homework   || f.homework,
        notes:      autoNotes       || f.notes,
      }));

      setAiOpen(false); // collapse AI panel, show filled form
      toast.success("Lesson plan generated — review and save");
    } catch (e: any) {
      toast.error("AI error: " + (e.message ?? "unknown"), { duration: 10000 });
    } finally { setAiGenerating(false); }
  }

  const formBranch = (user?.role === "super_admin" ? activeBranch : user?.branch_id) ?? "";
  const { data: courses } = useQuery({
    queryKey: ["courses-list", formBranch],
    queryFn: async () => (await supabase.from("courses").select("id,name").eq("status","active").eq("branch_id", formBranch).order("name").throwOnError()).data ?? [],
  });
  const { data: instructors } = useQuery({
    queryKey: ["instructors-active", formBranch],
    queryFn: async () => (await supabase.from("instructors").select("id,first_name,last_name").eq("status","active").eq("branch_id", formBranch).order("first_name").throwOnError()).data ?? [],
  });

  async function save() {
    if (!form.title || !form.lesson_date) { toast.error("Title and date required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, branch_id: (user?.role === "super_admin" ? activeBranch : user?.branch_id) ?? "",
        duration_minutes: Number(form.duration_minutes),
        course_id: form.course_id || null, instructor_id: form.instructor_id || null,
        lesson_time: form.lesson_time || null };
      if (initial) {
        const { error } = await supabase.from("lesson_plans").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Plan updated");
      } else {
        const { error, data: inserted } = await supabase.from("lesson_plans").insert(payload).select().single();
        if (error) throw error;
        // DB trigger handles auto-session creation — no frontend action needed
        // (trigger: lesson_plan_creates_session fires AFTER INSERT on lesson_plans)
        // If progressive, create additional linked lesson plans
        if (isProgressive && inserted && sessionCount > 1) {
          for (let i = 1; i < sessionCount; i++) {
            await supabase.from("lesson_plans").insert({
              ...payload,
              title: `${form.title} — Session ${i + 1} of ${sessionCount}`,
              lesson_date: null, // Admin/instructor fills each date separately
              session_id: null,
              calendar_synced_at: null,
              calendar_event_id: null,
            });
          }
          toast.success(`${sessionCount} linked lesson plans created`);
        }
        // Auto-create material fund request if requested
        if (requestMaterials && form.materials.trim() && inserted) {
          await supabase.from("fund_requests").insert({
            branch_id: payload.branch_id,
            instructor_id: form.instructor_id || null,
            lesson_plan_id: inserted.id,
            title: `Materials for: ${form.title}`,
            category: "materials",
            description: `Lesson: ${form.title} (${form.lesson_date})\n\nItemised materials:\n${matItems.filter(i => i.name).map(i => `• ${i.name} × ${i.qty || 1} @ KES ${Number(i.cost).toLocaleString()} = KES ${((Number(i.qty)||1)*(Number(i.cost)||0)).toLocaleString()}`).join("\n")}\n\nTotal: KES ${matTotal.toLocaleString()}`,
            amount: matTotal || null,
            urgency: "normal",
            status: "pending",
          });
          toast.success("Lesson plan created + material request sent to admin ✓");
        } else {
          toast.success("Lesson plan created");
        }
      }
      onSaved();
    } catch (e: any) { toast.error("Save failed: " + e.message); console.error("Lesson plan save error:", e); } finally { setSaving(false); }
  }



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Lesson Plan" : "New Lesson Plan"}</h2>
        {/* AI Lesson Generator */}
        <div className="rounded-xl border border-accent/30 bg-accent/5 mb-3 overflow-hidden">
          <button type="button" onClick={() => setAiOpen(!aiOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4"/>
              AI Lesson Plan Generator
              {form.title && !aiOpen && <span className="text-xs text-muted-foreground font-normal ml-1">— plan generated ✓</span>}
            </div>
            {aiOpen ? <ChevronUp className="size-4"/> : <ChevronDown className="size-4"/>}
          </button>
          {aiOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-accent/20">
              <p className="text-xs text-muted-foreground pt-3">
                Describe the lesson and AI will generate the full plan — objectives, materials, activities and homework.
              </p>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Introduction to watercolour for beginners, focusing on wet-on-wet technique and colour mixing..."
                rows={3}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex gap-2 flex-wrap">
                {[
                  "Intro to watercolour, 60 min, beginners",
                  "Pencil sketching portraits, teens",
                  "Acrylic painting basics, 45 min",
                  "Guitar chord progressions, beginners",
                  "Mixed media collage, adults",
                ].map((s) => (
                  <button key={s} type="button" onClick={() => setAiPrompt(s)}
                    className="text-xs px-2.5 py-1 rounded-full border border-accent/30 text-accent hover:bg-accent/10 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
              <button type="button" onClick={generateWithAI} disabled={aiGenerating || !aiPrompt.trim()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition">
                {aiGenerating
                  ? <><Loader2 className="size-4 animate-spin"/>Generating lesson plan…</>
                  : <><Sparkles className="size-4"/>Generate Lesson Plan</>}
              </button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(v) => setForm({...form,title:v})}/></Field>
          <Field label="Course">
            <select value={form.course_id} onChange={(e) => setForm({...form,course_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select course —</option>
              {(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Instructor">
            <select value={form.instructor_id} onChange={(e) => setForm({...form,instructor_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {(instructors ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.first_name} {i.last_name}</option>)}
            </select>
          </Field>
          <Field label="Date"><Input type="date" value={form.lesson_date} onChange={(v) => setForm({...form,lesson_date:v})}/></Field>
          <Field label="Start Time"><Input type="time" value={form.lesson_time} onChange={(v) => setForm({...form,lesson_time:v})}/></Field>
          <Field label="Duration (minutes)"><Input type="number" value={String(form.duration_minutes)} onChange={(v) => setForm({...form,duration_minutes:Number(v)})}/></Field>
          <TA label="Learning Objectives" field="objectives" form={form} setForm={setForm}/>
          <TA label="Materials Needed" field="materials" form={form} setForm={setForm}/>
          {form.materials.trim() && (
            <div className="sm:col-span-2 rounded-lg bg-accent/5 border border-accent/20 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="req-materials" checked={requestMaterials}
                  onChange={(e) => setRequestMaterials(e.target.checked)}
                  className="size-4 rounded accent-accent cursor-pointer"/>
                <label htmlFor="req-materials" className="text-xs cursor-pointer select-none">
                  <span className="font-medium text-accent">📋 Send as material request to admin</span>
                  <span className="text-muted-foreground ml-1">— auto-creates a fund request</span>
                </label>
              </div>
              {requestMaterials && (
                <div className="pl-1 space-y-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_56px_80px_24px] gap-1.5 px-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Item</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-center">Qty</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Unit cost (KES)</span>
                    <span/>
                  </div>
                  {/* Item rows */}
                  {matItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_56px_80px_24px] gap-1.5 items-center">
                      <input
                        value={item.name}
                        onChange={(e) => updateMatItem(i, "name", e.target.value)}
                        placeholder={`Material ${i + 1}`}
                        className="bg-background border border-input rounded px-2 py-1 text-xs w-full"
                      />
                      <input
                        type="number" min={1}
                        value={item.qty}
                        onChange={(e) => updateMatItem(i, "qty", e.target.value)}
                        className="bg-background border border-input rounded px-2 py-1 text-xs text-center w-full"
                      />
                      <input
                        type="number" min={0}
                        value={item.cost}
                        onChange={(e) => updateMatItem(i, "cost", e.target.value)}
                        placeholder="0"
                        className="bg-background border border-input rounded px-2 py-1 text-xs text-right w-full"
                      />
                      <button type="button" onClick={() => removeMatItem(i)}
                        className="text-muted-foreground hover:text-destructive text-xs text-center">✕</button>
                    </div>
                  ))}
                  {/* Add row + total */}
                  <div className="flex items-center justify-between pt-1">
                    <button type="button" onClick={addMatItem}
                      className="text-xs text-accent hover:underline flex items-center gap-1">
                      + Add item
                    </button>
                    {matTotal > 0 && (
                      <div className="text-xs font-bold text-success">
                        Total: KES {matTotal.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <TA label="Activities" field="activities" form={form} setForm={setForm}/>
          <TA label="Homework / Follow-up" field="homework" form={form} setForm={setForm}/>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── PROGRESS REPORTS ── */
function ProgressReportsTab() {
  const { user, activeBranch } = useAuth();
  const branch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["progress-reports", branch],
    queryFn: async () => (await supabase.from("student_progress_reports")
      .select("*,students(first_name,last_name,admission_number),courses(name),instructors(first_name,last_name)")
      .eq("branch_id", branch ?? "")
      .order("report_date", { ascending: false }).throwOnError()).data ?? [],
  });

  const GRADE_COLORS: Record<string, string> = {
    "Excellent":        "bg-success/15 text-success border-success/30",
    "Good":             "bg-blue-500/15 text-blue-400 border-blue-500/30",
    "Satisfactory":     "bg-warning/15 text-warning border-warning/30",
    "Needs Improvement":"bg-danger/15 text-danger border-danger/30",
  };

  return (
    <PageCard title="Student Progress Reports"
      action={
        <button onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
          <Plus className="size-4"/>New Report
        </button>
      }>
      <div className="space-y-3">
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        {(data ?? []).map((r: any) => (
          <div key={r.id} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-sm">{r.students?.first_name} {r.students?.last_name}</div>
                <div className="text-xs text-muted-foreground">{r.courses?.name} · {r.report_date} · {r.period_label}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={GRADE_COLORS[r.overall_grade] ?? ""}>{r.overall_grade}</Badge>
                <button onClick={() => setPreview(r)} title="Preview & Share"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20">
                  <Share2 className="size-3"/>Share
                </button>
              </div>
            </div>
            {r.instructor_comments && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{r.instructor_comments}</p>
            )}
            <div className="flex gap-4 text-xs text-muted-foreground mt-2">
              <span>Attendance: {r.attendance_present}/{r.attendance_sessions} sessions</span>
            </div>
          </div>
        ))}
        {!isLoading && !data?.length && (
          <p className="py-8 text-center text-muted-foreground">No reports yet — create a student progress report</p>
        )}
      </div>
      {open && (
        <ReportForm initial={editing} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["progress-reports"] }); }}/>
      )}
      {preview && <ReportPreview report={preview} onClose={() => setPreview(null)}/>}
    </PageCard>
  );
}

function ReportPreview({ report, onClose }: { report: any; onClose: () => void }) {
  const isDice = report.branch_id === "dice-arts-nairobi";
  const schoolName = isDice ? "Dice Arts Academy" : "PrimeLuck Arts Academy";
  const tagline   = isDice ? "Inspiring Creativity" : "Arts Academy · Nairobi";

  const whatsappText = `*${schoolName} — Student Progress Report*\n\n👤 *Student:* ${report.students?.first_name} ${report.students?.last_name}\n📚 *Course:* ${report.courses?.name ?? "—"}\n📅 *Period:* ${report.period_label ?? report.report_date}\n\n📊 *Overall Grade:* ${report.overall_grade}\n✅ *Attendance:* ${report.attendance_present}/${report.attendance_sessions} sessions\n\n🎨 *Skills Demonstrated*\n${report.skills_demonstrated ?? "—"}\n\n📈 *Areas for Improvement*\n${report.areas_for_improvement ?? "—"}\n\n💬 *Instructor's Comments*\n${report.instructor_comments ?? "—"}\n\n_${schoolName} · ${tagline}_`;

  function printReport() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Progress Report</title>
<style>
  body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#111;padding:20px;}
  h1{color:#2d1b69;border-bottom:3px solid #d4a017;padding-bottom:8px;}
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;}
  .school{font-size:20px;font-weight:bold;color:#2d1b69;}
  .tagline{font-size:12px;color:#666;}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:bold;background:#d4a017;color:#fff;}
  .section{margin:16px 0;padding:12px;background:#f9f9f9;border-left:4px solid #d4a017;border-radius:4px;}
  .section h3{margin:0 0 8px;font-size:13px;color:#2d1b69;text-transform:uppercase;letter-spacing:.5px;}
  .section p{margin:0;font-size:14px;color:#333;line-height:1.5;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .stat{text-align:center;padding:12px;background:#2d1b69;color:#fff;border-radius:8px;}
  .stat .val{font-size:24px;font-weight:bold;color:#d4a017;}
  .stat .lbl{font-size:11px;opacity:.8;margin-top:4px;}
  footer{margin-top:32px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px;}
  @media print{body{margin:0;}}
</style></head><body>
<div class="header">
  <div><div class="school">${schoolName}</div><div class="tagline">${tagline}</div></div>
  <div class="badge">${report.overall_grade}</div>
</div>
<h1>Student Progress Report</h1>
<div class="grid" style="margin-bottom:20px">
  <div><strong>Student:</strong> ${report.students?.first_name} ${report.students?.last_name}</div>
  <div><strong>Admission #:</strong> ${report.students?.admission_number}</div>
  <div><strong>Course:</strong> ${report.courses?.name ?? "—"}</div>
  <div><strong>Period:</strong> ${report.period_label ?? report.report_date}</div>
</div>
<div class="grid">
  <div class="stat"><div class="val">${report.attendance_present}</div><div class="lbl">Sessions Present</div></div>
  <div class="stat"><div class="val">${report.attendance_sessions > 0 ? Math.round(report.attendance_present/report.attendance_sessions*100) : 0}%</div><div class="lbl">Attendance Rate</div></div>
</div>
${report.skills_demonstrated ? `<div class="section"><h3>Skills Demonstrated</h3><p>${report.skills_demonstrated}</p></div>` : ""}
${report.areas_for_improvement ? `<div class="section"><h3>Areas for Improvement</h3><p>${report.areas_for_improvement}</p></div>` : ""}
${report.instructor_comments ? `<div class="section"><h3>Instructor's Comments</h3><p>${report.instructor_comments}</p></div>` : ""}
<footer>Generated by ${schoolName} Management System · ${new Date().toLocaleDateString()}</footer>
<script>window.print();</script>
</body></html>`);
    w.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-1">Share Progress Report</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {report.students?.first_name} {report.students?.last_name} · {report.overall_grade}
        </p>
        <div className="rounded-xl border border-border bg-background p-4 text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-48 overflow-y-auto mb-4">
          {whatsappText}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`,"_blank")}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-[#25D366] text-white hover:bg-[#22c55e]">
            <MessageCircle className="size-4"/>Send via WhatsApp
          </button>
          <button onClick={printReport}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border border-border hover:bg-muted">
            <Share2 className="size-4"/>Download / Print PDF
          </button>
        </div>
        <PhotoGallery reportId={report.id}/>
        <button onClick={onClose} className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground text-center">Close</button>
      </div>
    </div>
  );
}

function PhotoGallery({ reportId }: { reportId: string }) {
  const { data: photos } = useQuery({
    queryKey: ["report-photos", reportId],
    queryFn: async () => {
      const { data } = await supabase.from("report_photos").select("*").eq("report_id", reportId);
      return (data ?? []).map((p: any) => ({
        ...p,
        url: supabase.storage.from("report-photos").getPublicUrl(p.storage_path).data.publicUrl,
      }));
    },
    enabled: !!reportId,
  });
  if (!photos?.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">Student Work Photos ({photos.length})</div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p: any) => (
          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
            className="aspect-square rounded-lg overflow-hidden border border-border hover:border-accent transition-colors">
            <img src={p.url} alt={p.caption||"Work photo"} className="w-full h-full object-cover hover:scale-105 transition-transform"/>
          </a>
        ))}
      </div>
    </div>
  );
}

function ReportForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { user, activeBranch } = useAuth();
  const formBranch = (user?.role === "super_admin" ? activeBranch : user?.branch_id) ?? "";
  const [form, setForm] = useState({
    student_id: initial?.student_id ?? "",
    course_id: initial?.course_id ?? "",
    instructor_id: initial?.instructor_id ?? (user?.linked_entity_id || ""),
    report_date: initial?.report_date ?? new Date().toISOString().slice(0, 10),
    period_label: initial?.period_label ?? "",
    attendance_sessions: initial?.attendance_sessions ?? 0,
    attendance_present: initial?.attendance_present ?? 0,
    skills_demonstrated: initial?.skills_demonstrated ?? "",
    areas_for_improvement: initial?.areas_for_improvement ?? "",
    overall_grade: initial?.overall_grade ?? "Good",
    instructor_comments: initial?.instructor_comments ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const newPhotos = Array.from(files).slice(0, 6 - photos.length).map(file => ({
      file, preview: URL.createObjectURL(file),
    }));
    setPhotos(p => [...p, ...newPhotos]);
  }
  function removePhoto(idx: number) {
    setPhotos(p => p.filter((_, i) => i !== idx));
  }

  const { data: students } = useQuery({ queryKey:["students-active", formBranch], queryFn: async () => {
    let q = supabase.from("students").select("id,first_name,last_name,admission_number").eq("status","active").order("first_name");
    if (formBranch) q = q.eq("branch_id", formBranch);
    return (await q.throwOnError()).data ?? [];
  }});
  const { data: courses }   = useQuery({ queryKey:["courses-list"],   queryFn: async () => (await supabase.from("courses").select("id,name").order("name").throwOnError()).data ?? [] });
  const { data: instructors } = useQuery({ queryKey:["instructors-active"], queryFn: async () => (await supabase.from("instructors").select("id,first_name,last_name").order("first_name").throwOnError()).data ?? [] });

  // Auto-fill attendance from DB when student+course selected
  async function autoFill(silent = false) {
    if (!form.student_id || !form.course_id) { if (!silent) toast.error("Select student and course first"); return; }
    const { data: attn } = await supabase.from("attendance_records")
      .select("status").eq("student_id", form.student_id)
      .in("session_id", (await supabase.from("sessions").select("id").eq("course_id", form.course_id)).data?.map((s:any)=>s.id) ?? []);
    const total = attn?.length ?? 0;
    const present = attn?.filter((a:any) => a.status === "present").length ?? 0;
    setForm(f => ({ ...f, attendance_sessions: total, attendance_present: present }));
    if (!silent) toast.success(`Auto-filled: ${present}/${total} sessions`);
  }

  // For a NEW report, auto-fill attendance as soon as both student and course are picked.
  // Skipped when editing an existing report so we don't silently overwrite a value the
  // instructor may have hand-adjusted; the "Auto-fill from records" button still works there.
  useEffect(() => {
    if (!initial && form.student_id && form.course_id) {
      autoFill(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.student_id, form.course_id]);

  async function save() {
    if (!form.student_id) { toast.error("Select a student"); return; }
    setSaving(true);
    try {
      const payload = { ...form, branch_id: formBranch,
        attendance_sessions: Number(form.attendance_sessions), attendance_present: Number(form.attendance_present),
        course_id: form.course_id || null, instructor_id: form.instructor_id || null };
      let reportId = initial?.id;
      if (initial) {
        const { error } = await supabase.from("student_progress_reports").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { data: newReport, error } = await supabase.from("student_progress_reports").insert(payload).select("id").single();
        if (error) throw error;
        reportId = newReport.id;
      }
      // Upload photos if any
      if (photos.length && reportId) {
        setUploadProgress(0);
        for (let i = 0; i < photos.length; i++) {
          const { file } = photos[i];
          const path = `${reportId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi,"_")}`;
          const { error: storErr } = await supabase.storage.from("report-photos").upload(path, file, { upsert: true });
          if (!storErr) {
            await supabase.from("report_photos").insert({ report_id: reportId, storage_path: path, caption: "" });
          }
          setUploadProgress(Math.round(((i+1)/photos.length)*100));
        }
      }
      toast.success(initial ? "Report updated" : "Report created");
      onSaved();
    } catch (e: any) { toast.error("Save failed: " + e.message); console.error("Lesson plan save error:", e); } finally { setSaving(false); }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit Report" : "New Progress Report"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Student" className="sm:col-span-2">
            <select value={form.student_id} onChange={(e) => setForm({...form,student_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select student —</option>
              {(students ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.admission_number})</option>)}
            </select>
          </Field>
          <Field label="Course">
            <select value={form.course_id} onChange={(e) => setForm({...form,course_id:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Overall Grade">
            <select value={form.overall_grade} onChange={(e) => setForm({...form,overall_grade:e.target.value})} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>Excellent</option><option>Good</option><option>Satisfactory</option><option>Needs Improvement</option>
            </select>
          </Field>
          <Field label="Report date"><Input type="date" value={form.report_date} onChange={(v) => setForm({...form,report_date:v})}/></Field>
          <Field label="Period label"><Input value={form.period_label} onChange={(v) => setForm({...form,period_label:v})} placeholder="e.g. Term 2 2026"/></Field>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Attendance</span>
              <button onClick={() => autoFill()} className="text-xs text-accent hover:underline">Auto-fill from records</button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input type="number" value={String(form.attendance_present)} onChange={(v) => setForm({...form,attendance_present:Number(v)})} placeholder="Present"/>
                <div className="text-xs text-muted-foreground mt-1 text-center">Present</div>
              </div>
              <div className="flex-1">
                <Input type="number" value={String(form.attendance_sessions)} onChange={(v) => setForm({...form,attendance_sessions:Number(v)})} placeholder="Total"/>
                <div className="text-xs text-muted-foreground mt-1 text-center">Total sessions</div>
              </div>
            </div>
          </div>
          <TA label="Skills Demonstrated" field="skills_demonstrated" form={form} setForm={setForm}/>
          <TA label="Areas for Improvement" field="areas_for_improvement" form={form} setForm={setForm}/>
          <TA label="Instructor's Comments" field="instructor_comments" form={form} setForm={setForm} rows={4}/>
        </div>
        {/* Photo upload */}
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground block mb-2">Work photos (optional, max 6)</label>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                <img src={p.preview} alt="" className="w-full h-full object-cover"/>
                <button type="button" onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black">✕</button>
              </div>
            ))}
            {photos.length < 6 && (
              <label className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-accent cursor-pointer flex flex-col items-center justify-center text-muted-foreground hover:text-accent transition-colors">
                <span className="text-2xl">+</span>
                <span className="text-xs mt-1">Add photo</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)}/>
              </label>
            )}
          </div>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-2">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-1.5 bg-accent rounded-full transition-all" style={{ width: `${uploadProgress}%` }}/>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Uploading photos… {uploadProgress}%</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving?"Saving…":"Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

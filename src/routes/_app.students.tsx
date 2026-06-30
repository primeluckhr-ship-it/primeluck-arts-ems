import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase, logAudit } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { formatKES, getStatusColor } from "@/lib/pla";
import { Plus, Search, Pencil, UserMinus, UserCheck, GraduationCap, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/students")({ component: StudentsPage });

const TYPE_LABELS: Record<string, string> = {
  junior: "Junior", teen: "Teen", adult: "Adult", institution: "Institution",
};
const TYPE_COLORS: Record<string, string> = {
  junior: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  teen: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  adult: "bg-green-500/15 text-green-400 border-green-500/30",
  institution: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const BRANCH_TABS = [
  { id: "all",              label: "All Students" },
  { id: "branch-1",        label: "PrimeLuck Arts" },
  { id: "dice-arts-nairobi", label: "Dice Arts" },
];

function StudentsPage() {
  const { user, activeBranch } = useAuth();
  const isSuper = user?.role === "super_admin";

  // Branch segment: super_admin can pick All / PLA / Dice; others are locked to their branch
  const [branchSegment, setBranchSegment] = useState<string>(
    isSuper ? (activeBranch ?? "all") : (user?.branch_id ?? "")
  );

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showAlumni, setShowAlumni] = useState(false);
  const qc = useQueryClient();

  // Compute the effective branch for queries
  const queryBranch = isSuper ? (branchSegment === "all" ? null : branchSegment) : (user?.branch_id ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["students-list", queryBranch, user?.role],
    queryFn: async () => {
      let q = supabase.from("students").select("*,institutions(name),course_enrollments(course_id,status,courses(name))");
      if (queryBranch) q = q.eq("branch_id", queryBranch);
      q = q.order("created_at", { ascending: false });
      const [{ data: students }, { data: accounts }] = await Promise.all([
        q,
        supabase.from("student_accounts").select("student_id,total_outstanding"),
      ]);
      return (students ?? []).map((s: any) => ({
        ...s,
        outstanding: accounts?.find((a: any) => a.student_id === s.id)?.total_outstanding ?? 0,
      }));
    },
  });

  // Active / alumni split
  const activeStudents = (data ?? []).filter((s: any) => s.status === "active");
  const alumniStudents = (data ?? []).filter((s: any) => s.status !== "active");

  const displayList = (showAlumni ? alumniStudents : activeStudents).filter((s: any) =>
    (typeFilter === "all" || s.student_type === typeFilter) &&
    (!search || `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(search.toLowerCase()))
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { junior: 0, teen: 0, adult: 0, institution: 0 };
    activeStudents.forEach((s: any) => { const t = s.student_type ?? "adult"; if (c[t] !== undefined) c[t]++; });
    return c;
  }, [data]);

  const isAdmin = ["super_admin", "finance_admin", "dice_admin"].includes(user?.role ?? "");

  async function removeStudent(s: any, newStatus: string) {
    const label = newStatus === "graduated" ? "Graduate" : "Remove (Left)";
    if (!confirm(`${label} ${s.first_name} ${s.last_name}? They will be moved to Alumni.`)) return;
    await supabase.from("students").update({ status: newStatus }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["students-list"], exact: false });
    toast.success(`${s.first_name} moved to Alumni`);
  }

  // The branch that a newly added student will belong to
  const addBranch = isSuper
    ? (branchSegment === "all" ? (activeBranch ?? "branch-1") : branchSegment)
    : (user?.branch_id ?? "branch-1");

  async function deleteStudent(s: any) {
    if (!confirm(`Permanently delete ${s.first_name} ${s.last_name}? This cannot be undone and will remove all records.`)) return;
    try {
      await supabase.from("attendance_charges").delete().eq("student_id", s.id);
      await supabase.from("attendance_records").delete().eq("student_id", s.id);
      await supabase.from("student_progress_reports").delete().eq("student_id", s.id);
      await supabase.from("assessments").delete().eq("student_id", s.id);
      await supabase.from("artwork_portfolio").delete().eq("student_id", s.id);
      await supabase.from("invoices").delete().eq("student_id", s.id);
      await supabase.from("payments").delete().eq("student_id", s.id);
      await supabase.from("course_enrollments").delete().eq("student_id", s.id);
      await supabase.from("student_accounts").delete().eq("student_id", s.id);
      await supabase.from("student_parents").delete().eq("student_id", s.id);
      await supabase.from("users").update({ linked_entity_id: null }).eq("linked_entity_id", s.id);
      const { error } = await supabase.from("students").delete().eq("id", s.id);
      if (error) throw error;
      logAudit({ user_id: user?.id, branch_id: s.branch_id, action: "DELETE", entity_type: "student", entity_id: s.id, description: `Student permanently deleted: ${s.first_name} ${s.last_name} (${s.admission_number || s.id})` });
      qc.invalidateQueries({ queryKey: ["students-list"], exact: false });
      toast.success(`${s.first_name} ${s.last_name} permanently deleted`);
    } catch (e: any) {
      toast.error("Delete failed: " + e.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* Super admin branch segment tabs */}
      {isSuper && (
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {BRANCH_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setBranchSegment(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${branchSegment === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Type summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <button key={type} onClick={() => setTypeFilter(typeFilter === type ? "all" : type)}
            className={`rounded-xl border p-3 text-left transition-all ${typeFilter === type ? "ring-2 ring-accent" : ""} ${TYPE_COLORS[type]}`}>
            <div className="text-2xl font-bold">{counts[type]}</div>
            <div className="text-xs font-medium mt-0.5">{label}s</div>
          </button>
        ))}
      </div>

      <PageCard
        title="Students"
        subtitle={showAlumni ? `${alumniStudents.length} alumni` : `${activeStudents.length} active`}
        action={
          isAdmin && (
            <button onClick={() => { setEditing(null); setOpen(true); }}
              className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
              <Plus className="size-4" /> Add Student
            </button>
          )
        }
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or admission #…"
              className="w-full bg-background border border-input rounded-md pl-9 pr-3 py-2 text-sm" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-2 text-sm">
            <option value="all">All types</option>
            <option value="junior">Juniors</option>
            <option value="teen">Teens</option>
            <option value="adult">Adults</option>
            <option value="institution">Institutions</option>
          </select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setShowAlumni(false)}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${!showAlumni ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <UserCheck className="size-3.5" />Active ({activeStudents.length})
            </button>
            <button onClick={() => setShowAlumni(true)}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${showAlumni ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <GraduationCap className="size-3.5" />Alumni ({alumniStudents.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3">Admission #</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Type / Institution</th>
              {isSuper && branchSegment === "all" && <th className="py-2 pr-3">Academy</th>}
              <th className="py-2 pr-3">Course(s)</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 text-right pr-3">Balance</th>
              <th className="py-2 w-20"></th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {displayList.map((s: any) => {
                const activeCourses = (s.course_enrollments ?? []).filter((e: any) => e.status === "active");
                return (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      <Link to="/students/$id" params={{ id: s.id }} className="text-accent hover:underline">{s.admission_number}</Link>
                    </td>
                    <td className="py-2.5 pr-3 font-medium">{s.first_name} {s.last_name}</td>
                    <td className="py-2.5 pr-3">
                      <Badge className={TYPE_COLORS[s.student_type ?? "adult"]}>{TYPE_LABELS[s.student_type ?? "adult"]}</Badge>
                      {s.student_type === "institution" && s.institutions?.name && (
                        <div className="text-xs text-muted-foreground mt-0.5">{s.institutions.name}</div>
                      )}
                    </td>
                    {isSuper && branchSegment === "all" && (
                      <td className="py-2.5 pr-3">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${s.branch_id === "dice-arts-nairobi" ? "bg-orange-500/15 text-orange-400" : "bg-blue-500/15 text-blue-400"}`}>
                          {s.branch_id === "dice-arts-nairobi" ? "Dice Arts" : "PrimeLuck"}
                        </span>
                      </td>
                    )}
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {activeCourses.length > 0
                        ? activeCourses.map((e: any) => e.courses?.name).filter(Boolean).join(", ")
                        : <span className="italic">Not enrolled</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge className={getStatusColor(s.status)}>
                        {s.status === "left" ? "Left" : s.status === "graduated" ? "Graduated 🎓" : s.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold">{formatKES(s.outstanding)}</td>
                    <td className="py-2.5">
                      <div className="flex gap-0.5">
                        <button onClick={() => { setEditing(s); setOpen(true); }} className="p-1.5 rounded hover:bg-muted" title="Edit"><Pencil className="size-3.5" /></button>
                        {isAdmin && !showAlumni && (
                          <>
                            <button onClick={() => removeStudent(s, "graduated")} className="p-1.5 rounded hover:bg-success/20 text-success" title="Graduated">
                              <GraduationCap className="size-3.5" />
                            </button>
                            <button onClick={() => removeStudent(s, "left")} className="p-1.5 rounded hover:bg-danger/20 text-danger" title="Left / Withdrawn">
                              <UserMinus className="size-3.5" />
                            </button>
                          </>
                        )}
                        {isAdmin && showAlumni && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => removeStudent(s, "active")} className="p-1.5 rounded hover:bg-success/20 text-success text-xs px-2" title="Restore">
                              Restore
                            </button>
                            <button onClick={() => deleteStudent(s)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive" title="Permanently delete">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && !displayList.length && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">
                  {showAlumni ? "No alumni yet" : "No active students"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      {open && (
        <StudentForm
          initial={editing}
          targetBranch={addBranch}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["students-list"], exact: false }); }}
        />
      )}
    </div>
  );
}

function StudentForm({ initial, targetBranch, onClose, onSaved }: {
  initial: any; targetBranch: string; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    date_of_birth: initial?.date_of_birth ?? "",
    gender: initial?.gender ?? "",
    school_name: initial?.school_name ?? "",
    grade: initial?.grade ?? "",
    skill_level: initial?.skill_level ?? "Beginner",
    enrollment_date: initial?.enrollment_date ?? new Date().toISOString().slice(0, 10),
    parent_phone: initial?.parent_phone ?? initial?.emergency_contact_phone ?? "",
    notes: initial?.notes ?? "",
    status: initial?.status ?? "active",
    student_type: initial?.student_type ?? "adult",
  });
  const [saving, setSaving] = useState(false);
  const [institutionId, setInstitutionId] = useState(initial?.institution_id ?? "");
  const [selectedCourseId, setSelectedCourseId] = useState(
    initial?.course_enrollments?.find((e: any) => e.status === "active")?.course_id ?? ""
  );
  const [feeOverride, setFeeOverride] = useState<string>(
    initial?.course_enrollments?.find((e: any) => e.status === "active")?.fee_override?.toString() ?? ""
  );

  const branchForLookup = targetBranch;

  const { data: institutions } = useQuery({
    queryKey: ["institutions-list", branchForLookup],
    queryFn: async () => (await supabase.from("institutions").select("id,name")
      .eq("is_active", true).eq("branch_id", branchForLookup).order("name")).data ?? [],
  });

  const { data: courses } = useQuery({
    queryKey: ["courses-active", branchForLookup],
    queryFn: async () => (await supabase.from("courses").select("id,name,monthly_fee,term_fee,session_fee,billing_cycle")
      .eq("status", "active").eq("branch_id", branchForLookup).order("name")).data ?? [],
  });
  const selectedCourse = (courses ?? []).find((c: any) => c.id === selectedCourseId);
  const standardFee = selectedCourse
    ? (selectedCourse.billing_cycle === "monthly" ? selectedCourse.monthly_fee
       : selectedCourse.billing_cycle === "per_session" ? selectedCourse.session_fee
       : selectedCourse.term_fee)
    : null;

  async function save() {
    if (!form.first_name.trim()) { toast.error("First name is required"); return; }
    setSaving(true);
    try {
      const prefix = branchForLookup === "dice-arts-nairobi" ? "DICE" : "PLA";
      const { data: lastStu } = await supabase.from("students")
        .select("admission_number")
        .ilike("admission_number", `${prefix}%`)
        .order("admission_number", { ascending: false }).limit(1);
      const lastNum = parseInt((lastStu?.[0]?.admission_number ?? `${prefix}0000`).replace(/\D/g, "")) || 0;
      const admission_number = initial?.admission_number || `${prefix}${String(lastNum + 1).padStart(4, "0")}`;

      const payload = {
        ...form,
        admission_number,
        institution_id: institutionId || null,
        branch_id: branchForLookup,
        date_of_birth: form.date_of_birth || null,
        enrollment_date: form.enrollment_date || null,
        emergency_contact_phone: form.parent_phone || null,
      };

      if (initial) {
        const { error } = await supabase.from("students").update(payload).eq("id", initial.id);
        if (error) throw error;
        // Update course enrollment if changed
        if (selectedCourseId) {
          const existing = initial.course_enrollments?.find((e: any) => e.status === "active");
          const overrideVal = feeOverride.trim() ? Number(feeOverride) : null;
          if (!existing || existing.course_id !== selectedCourseId) {
            if (existing) await supabase.from("course_enrollments").update({ status: "inactive" }).eq("course_id", existing.course_id).eq("student_id", initial.id);
            await supabase.from("course_enrollments").upsert({
              student_id: initial.id, course_id: selectedCourseId,
              status: "active", enrollment_date: form.enrollment_date || new Date().toISOString().slice(0, 10),
              fee_override: overrideVal,
            }, { onConflict: "student_id,course_id" });
          } else {
            // Same course — just update the fee override if it changed
            await supabase.from("course_enrollments").update({ fee_override: overrideVal })
              .eq("course_id", selectedCourseId).eq("student_id", initial.id);
          }
        }
        toast.success("Student updated");
      } else {
        const { error, data: inserted } = await supabase.from("students").insert(payload).select().single();
        if (error) throw error;
        // Enroll in course — auto-detect for institution students
        let enrollCourseId = selectedCourseId;
        if (form.student_type === "institution" && institutionId) {
          const { data: instData } = await supabase.from("institutions").select("course_id").eq("id", institutionId).maybeSingle();
          if (instData?.course_id) enrollCourseId = instData.course_id;
        }
        if (enrollCourseId && inserted) {
          await supabase.from("course_enrollments").insert({
            student_id: inserted.id, course_id: enrollCourseId,
            status: "active", enrollment_date: form.enrollment_date || new Date().toISOString().slice(0, 10),
            fee_override: feeOverride.trim() ? Number(feeOverride) : null,
          });
        }
        await logAudit({
          user_id: user?.id, branch_id: payload.branch_id, action: "CREATE",
          entity_type: "student", entity_id: inserted?.id,
          description: `Added student: ${payload.first_name} ${payload.last_name}`,
        });
        toast.success("Student added");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">{initial ? "Edit Student" : "Add Student"}</h2>
        {!initial && (
          <p className="text-xs text-muted-foreground mb-4">
            Adding to: <span className="font-semibold text-accent">
              {branchForLookup === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy"}
            </span>
          </p>
        )}

        {/* ── Section 1: Student type ── */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Student type</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <button key={type} type="button"
                onClick={() => setForm({ ...form, student_type: type })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${form.student_type === type ? TYPE_COLORS[type] + " ring-2 ring-offset-1 ring-offset-card ring-current" : "border-border text-muted-foreground hover:border-accent"}`}>
                {label}
              </button>
            ))}
          </div>
          {form.student_type === "institution" && (
            <div className="mt-2">
              <label className="block text-xs text-muted-foreground mb-1 font-medium">Linked Institution <span className="text-danger">*</span></label>
              <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
                <option value="">— Select institution —</option>
                {(institutions ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              {!institutionId && <p className="text-xs text-warning mt-1">Select which institution this student belongs to</p>}
            </div>
          )}
        </div>

        {/* ── Section 2: Course enrollment ── */}
        {form.student_type === "institution" ? (
          <div className="border-t border-border/50 pt-4 mb-4 rounded-lg bg-accent/5 border border-accent/20 p-3">
            <p className="text-xs font-semibold text-accent mb-1">📚 Course Auto-Assigned</p>
            <p className="text-xs text-muted-foreground">
              This student will be automatically enrolled in the course linked to their institution.
              {institutionId && courses?.length === 0 && " (Set up the institution's course in Partner Schools first)"}
            </p>
          </div>
        ) : (
          <div className="border-t border-border/50 pt-4 mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Enroll in Course</p>
            <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— No course (enroll later) —</option>
              {(courses ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Student will appear in this course's attendance sessions</p>

            {selectedCourseId && (
              <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
                <p className="text-xs font-medium mb-1.5">💰 Custom Fee for this student</p>
                <div className="flex items-center gap-3">
                  <input type="number" value={feeOverride} onChange={(e) => setFeeOverride(e.target.value)}
                    placeholder={standardFee ? `Standard: KES ${Number(standardFee).toLocaleString()}` : "No standard fee set"}
                    className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm"/>
                  {feeOverride.trim() && (
                    <button type="button" onClick={() => setFeeOverride("")}
                      className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {feeOverride.trim()
                    ? `This student will be billed KES ${Number(feeOverride).toLocaleString()} instead of the standard fee.`
                    : "Leave blank to use the course's standard fee for this student."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Section 3: Personal details ── */}
        <div className="border-t border-border/50 pt-4 grid sm:grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} /></Field>
          <Field label="Last name"><Input value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} /></Field>
          <Field label="Parent / Guardian Phone" className="sm:col-span-2">
            <Input value={form.parent_phone} onChange={(v) => setForm({ ...form, parent_phone: v })} placeholder="+254… — WhatsApp reminders sent here" />
          </Field>
        </div>

        {/* ── Section 4: Academic info ── */}
        <div className="border-t border-border/50 pt-4 grid sm:grid-cols-2 gap-3">
          <Field label="School / Institution name"><Input value={form.school_name} onChange={(v) => setForm({ ...form, school_name: v })} /></Field>
          <Field label="Grade / Class"><Input value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} placeholder="e.g. Form 2, Grade 5" /></Field>
          <Field label="Skill level">
            <select value={form.skill_level} onChange={(e) => setForm({ ...form, skill_level: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
            </select>
          </Field>
          <Field label="Enrollment date">
            <input type="date" value={form.enrollment_date}
              onChange={(e) => setForm({ ...form, enrollment_date: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
        </div>

        {/* ── Section 5: Status & notes ── */}
        <div className="border-t border-border/50 pt-4 grid sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="graduated">Graduated</option>
              <option value="left">Left / Withdrawn</option>
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"
              placeholder="Any additional notes…" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="text-xs font-medium text-muted-foreground block mb-1">{label}</span>{children}</label>;
}

export function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />;
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard } from "@/components/app-shell";
import { Plus, Share2, ImageIcon, Star, Upload, X, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/portfolio")({ component: PortfolioPage });

const MEDIUMS = ["Pencil","Pen & Ink","Watercolour","Oil Paint","Acrylic","Charcoal","Pastel","Mixed Media","Digital","Sculpture","Collage"];

function PortfolioPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"gallery"|"shared">("gallery");
  const qc = useQueryClient();
  const isAdmin = ["super_admin","finance_admin","dice_admin"].includes(user?.role ?? "");
  const isInstructor = user?.role === "teacher" || user?.role === "instructor";

  const { data: students } = useQuery({
    queryKey: ["students-portfolio", user?.branch_id],
    queryFn: async () => {
      let q = supabase.from("students").select("id,first_name,last_name,student_type").eq("status","active").order("first_name");
      if (user?.role !== "super_admin") q = q.eq("branch_id", user?.branch_id ?? "");
      return (await q).data ?? [];
    },
    enabled: isAdmin || isInstructor,
  });

  // For parent: get their children's IDs
  const { data: childIds } = useQuery({
    queryKey: ["parent-children-ids", user?.linked_entity_id],
    queryFn: async () => {
      const { data } = await supabase.from("student_parents").select("student_id").eq("parent_id", user!.linked_entity_id!);
      return (data ?? []).map((r: any) => r.student_id);
    },
    enabled: user?.role === "parent",
  });

  const { data: artworks, isLoading } = useQuery({
    queryKey: ["portfolio-artworks", user?.branch_id, studentFilter, viewMode],
    queryFn: async () => {
      let q = supabase.from("artwork_portfolio")
        .select("*,students(first_name,last_name,student_type)")
        .order("created_at", { ascending: false });

      if (viewMode === "shared") q = q.eq("is_shared", true);

      if (user?.role === "parent" && childIds) {
        q = q.in("student_id", childIds.length ? childIds : ["none"]);
      } else if (user?.role === "student") {
        q = q.eq("student_id", user.linked_entity_id ?? "none");
      } else {
        if (!isAdmin) q = q.eq("branch_id", user?.branch_id ?? "");
        if (studentFilter !== "all") q = q.eq("student_id", studentFilter);
      }
      return (await q).data ?? [];
    },
    enabled: user?.role !== "parent" || !!childIds,
  });

  async function toggleShare(id: string, current: boolean) {
    await supabase.from("artwork_portfolio").update({ is_shared: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["portfolio-artworks"] });
    toast.success(current ? "Artwork hidden from shared view" : "Artwork shared ✓");
  }

  async function toggleFeatured(id: string, current: boolean) {
    await supabase.from("artwork_portfolio").update({ is_featured: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["portfolio-artworks"] });
  }

  // Group by student
  const grouped: Record<string, any[]> = {};
  (artworks ?? []).forEach((a: any) => {
    const key = a.student_id ?? "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  const studentMap = Object.fromEntries((students ?? []).map((s: any) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {/* View toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["gallery","shared"] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-sm capitalize ${viewMode===m?"bg-accent text-accent-foreground":"text-muted-foreground hover:bg-muted"}`}>
              {m === "shared" ? "🔗 Shared Links" : "🖼 All Artwork"}
            </button>
          ))}
        </div>

        {/* Student filter */}
        {(isAdmin || isInstructor) && (
          <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-1.5 text-sm">
            <option value="all">All Students</option>
            {(students ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </select>
        )}

        <div className="ml-auto">
          {(isAdmin || isInstructor) && (
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium">
              <Plus className="size-4"/>Add Artwork
            </button>
          )}
        </div>
      </div>

      {viewMode === "shared" && (
        <div className="rounded-lg bg-accent/5 border border-accent/20 px-4 py-3 text-sm text-accent">
          🔗 These artworks are shared — parents and students can view them via the shared portfolio link.
        </div>
      )}

      {isLoading && <p className="text-center text-muted-foreground py-12">Loading…</p>}

      {/* Gallery — grouped by student */}
      {Object.keys(grouped).length === 0 && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="size-10 mx-auto mb-3 opacity-30"/>
          <p>{viewMode==="shared" ? "No shared artworks yet." : "No artworks yet — add the first one."}</p>
        </div>
      )}

      {Object.entries(grouped).map(([sid, arts]) => {
        const stu = studentMap[sid] ?? arts[0]?.students;
        const stuName = stu ? `${stu.first_name} ${stu.last_name}` : "Unknown Student";
        return (
          <div key={sid} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border"/>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{stuName}</span>
              <div className="h-px flex-1 bg-border"/>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {arts.map((a: any) => (
                <div key={a.id} className="group relative rounded-xl overflow-hidden border border-border bg-card aspect-square">
                  {a.file_url ? (
                    <img src={a.file_url} alt={a.title} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <ImageIcon className="size-8 text-muted-foreground/40"/>
                    </div>
                  )}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                    <div className="flex gap-1 justify-end">
                      {(isAdmin || isInstructor) && (
                        <>
                          <button onClick={() => toggleFeatured(a.id, a.is_featured)} title="Toggle featured"
                            className={`size-6 rounded flex items-center justify-center ${a.is_featured ? "text-yellow-400" : "text-white/60 hover:text-yellow-400"}`}>
                            <Star className="size-3.5" fill={a.is_featured?"currentColor":"none"}/>
                          </button>
                          <button onClick={() => toggleShare(a.id, a.is_shared)} title="Toggle share"
                            className={`size-6 rounded flex items-center justify-center ${a.is_shared ? "text-accent" : "text-white/60 hover:text-accent"}`}>
                            <Share2 className="size-3.5"/>
                          </button>
                        </>
                      )}
                      {a.file_url && (
                        <a href={a.file_url} target="_blank" rel="noopener noreferrer"
                          className="size-6 rounded flex items-center justify-center text-white/60 hover:text-white">
                          <ExternalLink className="size-3.5"/>
                        </a>
                      )}
                    </div>
                    <div>
                      <p className="text-white text-xs font-semibold line-clamp-1">{a.title}</p>
                      <p className="text-white/60 text-[10px]">{a.medium} · {a.upload_date ? format(new Date(a.upload_date),"d MMM yyyy") : ""}</p>
                    </div>
                  </div>
                  {a.is_featured && (
                    <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-yellow-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full">FEATURED</div>
                  )}
                  {a.is_shared && (
                    <div className="absolute bottom-1.5 right-1.5 bg-accent/80 text-accent-foreground text-[9px] px-1.5 py-0.5 rounded-full">SHARED</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {open && (
        <ArtworkForm
          students={students ?? []}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["portfolio-artworks"] }); }}
        />
      )}
    </div>
  );
}

function ArtworkForm({ students, onClose, onSaved }: { students: any[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ student_id: "", title: "", description: "", medium: "Watercolour", is_featured: false, is_shared: false });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!form.student_id || !form.title) { toast.error("Select student and enter title"); return; }
    setSaving(true);
    try {
      let file_url = "";
      if (file) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user?.branch_id ?? "pla"}/${form.student_id}/${Date.now()}.${ext}`;
        const { error: upErr, data: upData } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
        if (!upErr) {
          file_url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
        }
      }
      await supabase.from("artwork_portfolio").insert({
        ...form,
        file_url: file_url || undefined,
        file_type: "image",
        upload_date: new Date().toISOString().slice(0, 10),
        branch_id: user?.branch_id ?? "",
        instructor_id: user?.linked_entity_id || null,
      }).throwOnError();
      toast.success("Artwork added ✓");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Add Artwork</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Student" className="sm:col-span-2">
            <select value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">— Select student —</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={v => setForm({ ...form, title: v })} /></Field>
          <Field label="Medium">
            <select value={form.medium} onChange={e => setForm({ ...form, medium: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              {MEDIUMS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea value={form.description} rows={2}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>

          {/* Image upload */}
          <Field label="Artwork photo" className="sm:col-span-2">
            <label className={`flex flex-col items-center justify-center gap-2 cursor-pointer rounded-xl border-2 border-dashed p-4 transition-colors ${preview ? "border-accent" : "border-border hover:border-accent"}`}>
              <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              {preview ? (
                <img src={preview} alt="Preview" className="size-24 object-cover rounded-lg" />
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tap to upload artwork photo</span>
                </>
              )}
            </label>
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
          </Field>

          <div className="sm:col-span-2 flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })} />
              ⭐ Featured
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.is_shared} onChange={e => setForm({ ...form, is_shared: e.target.checked })} />
              🔗 Share publicly
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

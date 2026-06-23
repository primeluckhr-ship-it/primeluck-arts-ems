import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/portfolio")({
  component: PortfolioPage,
});

function PortfolioPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");

  const studentIdsScope = useQuery({
    queryKey: ["portfolio-scope", user?.id, user?.role, user?.linked_entity_id],
    queryFn: async () => {
      if (user?.role === "student") return user.linked_entity_id ? [user.linked_entity_id] : [];
      if (user?.role === "parent" && user.linked_entity_id) {
        const { data } = await supabase.from("student_parents").select("student_id").eq("parent_id", user.linked_entity_id);
        return (data ?? []).map((r: any) => r.student_id);
      }
      return null; // null = all
    },
  });

  const { data } = useQuery({
    queryKey: ["portfolio-list", studentIdsScope.data, studentFilter],
    enabled: studentIdsScope.isSuccess,
    queryFn: async () => {
      let q = supabase.from("artwork_portfolio").select("*,students(first_name,last_name,admission_number)").order("created_at", { ascending: false });
      if (studentIdsScope.data) q = q.in("student_id", studentIdsScope.data);
      if (studentFilter) q = q.eq("student_id", studentFilter);
      return (await q).data ?? [];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["portfolio-students"],
    enabled: user?.role === "super_admin" || user?.role === "teacher",
    queryFn: async () => (await supabase.from("students").select("id,first_name,last_name").order("first_name")).data ?? [],
  });

  const canCreate = user?.role === "super_admin" || user?.role === "teacher";

  return (
    <PageCard
      title="Portfolio"
      subtitle={`${data?.length ?? 0} artworks`}
      action={canCreate && <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium"><Plus className="size-4" /> Add Artwork</button>}
    >
      {(user?.role === "super_admin" || user?.role === "teacher") && (
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="bg-background border border-input rounded-md px-3 py-2 text-sm mb-4">
          <option value="">All students</option>
          {(students ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {(data ?? []).map((a: any) => (
          <div key={a.id} className="bg-card border border-border rounded-lg overflow-hidden group">
            <div className="aspect-square bg-muted relative">
              {a.file_url ? <img src={a.file_url} alt={a.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No image</div>}
              {a.is_featured && <Badge className="absolute top-2 left-2 bg-accent text-accent-foreground border-accent">★ Featured</Badge>}
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold truncate">{a.title}</div>
              <div className="text-xs text-muted-foreground truncate">{a.students?.first_name} {a.students?.last_name}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{a.medium || "—"} · {a.created_at ? format(new Date(a.created_at), "dd MMM yyyy") : ""}</div>
            </div>
          </div>
        ))}
        {!data?.length && <div className="col-span-full text-center py-12 text-muted-foreground">No artwork yet.</div>}
      </div>
      {open && <ArtworkForm students={students ?? []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["portfolio-list"] }); }} />}
    </PageCard>
  );
}

function ArtworkForm({ students, onClose, onSaved }: { students: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    student_id: "", title: "", description: "", medium: "Pencil", file_url: "", is_featured: false,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!form.student_id || !form.title) { toast.error("Pick student and title"); return; }
    setSaving(true);
    try {
      await supabase.from("artwork_portfolio").insert(form).throwOnError();
      toast.success("Artwork added"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Add Artwork</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Student" className="sm:col-span-2">
            <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          </Field>
          <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} /></Field>
          <Field label="Medium">
            <select value={form.medium} onChange={(e) => setForm({ ...form, medium: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              <option>Pencil</option><option>Watercolor</option><option>Acrylic</option><option>Oil</option><option>Digital</option><option>Mixed</option>
            </select>
          </Field>
          <Field label="Image URL"><Input value={form.file_url} onChange={(v) => setForm({ ...form, file_url: v })} placeholder="https://…" /></Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea value={form.description} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm" />
          </Field>
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Featured artwork
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

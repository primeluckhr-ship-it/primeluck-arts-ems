import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/portfolio/gallery/$branch")({ component: AcademyGallery });

function AcademyGallery() {
  const { branch } = Route.useParams();
  const academy = branch === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy";

  const { data: artworks, isLoading } = useQuery({
    queryKey: ["pub-gallery", branch],
    queryFn: async () =>
      (await supabase.from("artwork_portfolio")
        .select("*,students(first_name,last_name)")
        .eq("branch_id", branch)
        .eq("is_shared", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })).data ?? [],
  });

  // Group by student
  const grouped: Record<string, { student: any; works: any[] }> = {};
  (artworks ?? []).forEach((a: any) => {
    if (!grouped[a.student_id]) grouped[a.student_id] = { student: a.students, works: [] };
    grouped[a.student_id].works.push(a);
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
      <p className="text-white/50">Loading gallery…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-10 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">Student Gallery</p>
        <h1 className="text-4xl font-bold">{academy}</h1>
        <p className="text-white/50 text-sm mt-2">{artworks?.length ?? 0} artworks by {Object.keys(grouped).length} students</p>
      </div>

      {/* Per-student sections */}
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {Object.keys(grouped).length === 0 && (
          <p className="text-center text-white/40 py-16">No shared artworks yet.</p>
        )}
        {Object.values(grouped).map(({ student, works }) => (
          <div key={works[0]?.student_id}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="size-8 rounded-full bg-accent/20 text-accent text-sm flex items-center justify-center font-bold">
                {student?.first_name?.[0]}
              </span>
              {student?.first_name} {student?.last_name}
              <span className="text-white/30 text-sm font-normal">{works.length} works</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {works.map((a: any) => (
                <div key={a.id} className="rounded-xl overflow-hidden bg-white/5 border border-white/10">
                  {a.file_url ? (
                    <img src={a.file_url} alt={a.title} className="w-full aspect-square object-cover"/>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center text-white/20 text-3xl">🎨</div>
                  )}
                  <div className="p-2.5">
                    <div className="flex items-center gap-1">
                      {a.is_featured && <span className="text-yellow-400 text-xs">⭐</span>}
                      <p className="text-xs font-medium truncate">{a.title}</p>
                    </div>
                    {a.medium && <p className="text-[10px] text-white/40">{a.medium}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center py-8 text-white/20 text-xs border-t border-white/10">
        © {new Date().getFullYear()} {academy}
      </div>
    </div>
  );
}

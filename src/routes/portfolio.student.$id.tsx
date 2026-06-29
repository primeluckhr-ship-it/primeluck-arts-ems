import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/portfolio/student/$id")({ component: StudentPortfolio });

function StudentPortfolio() {
  const { id } = Route.useParams();

  const { data: student } = useQuery({
    queryKey: ["pub-student", id],
    queryFn: async () => (await supabase.from("students").select("first_name,last_name,student_type,branch_id").eq("id", id).single()).data,
  });

  const { data: artworks, isLoading } = useQuery({
    queryKey: ["pub-portfolio", id],
    queryFn: async () =>
      (await supabase.from("artwork_portfolio").select("*").eq("student_id", id).eq("is_shared", true).order("is_featured", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });

  const academy = student?.branch_id === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy";

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]">
      <p className="text-white/50">Loading portfolio…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-8 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-2">{academy}</p>
        <h1 className="text-3xl font-bold">{student?.first_name} {student?.last_name}</h1>
        <p className="text-white/50 text-sm mt-1">Student Portfolio · {artworks?.length ?? 0} artworks</p>
      </div>

      {/* Gallery */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {artworks?.length === 0 ? (
          <p className="text-center text-white/40 py-16">No shared artworks yet.</p>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {(artworks ?? []).map((a: any) => (
              <div key={a.id} className="break-inside-avoid rounded-xl overflow-hidden bg-white/5 border border-white/10 group">
                {a.image_url ? (
                  <img src={a.image_url} alt={a.title} className="w-full object-cover"/>
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-white/20 text-4xl">🎨</div>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-1.5">
                    {a.is_featured && <span className="text-yellow-400 text-xs">⭐</span>}
                    <p className="text-sm font-medium truncate">{a.title}</p>
                  </div>
                  {a.medium && <p className="text-xs text-white/40 mt-0.5">{a.medium}</p>}
                  {a.description && <p className="text-xs text-white/50 mt-1 line-clamp-2">{a.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center py-8 text-white/20 text-xs border-t border-white/10">
        © {new Date().getFullYear()} {academy}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/portfolio/student/$id")({ component: StudentPortfolio });

const GOLD = "#c9a84c";
const BG   = "#080808";
const CREAM = "#f0ebe0";

function StudentPortfolio() {
  const { id } = Route.useParams();

  const { data: student } = useQuery({
    queryKey: ["pub-student", id],
    queryFn: async () =>
      (await supabase.from("students").select("first_name,last_name,student_type,branch_id,skill_level").eq("id", id).single()).data,
  });

  const { data: artworks, isLoading } = useQuery({
    queryKey: ["pub-portfolio", id],
    queryFn: async () =>
      (await supabase.from("artwork_portfolio")
        .select("*")
        .eq("student_id", id)
        .eq("is_shared", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false }).throwOnError()).data ?? [],
  });

  const featured = (artworks ?? []).filter((a: any) => a.is_featured);
  const rest     = (artworks ?? []).filter((a: any) => !a.is_featured);
  const academy  = student?.branch_id === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy";
  const year     = new Date().getFullYear();

  return (
    <div style={{ background: BG, color: CREAM, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300&display=swap" rel="stylesheet"/>

      <style>{`
        .art-card { position:relative; overflow:hidden; cursor:pointer; }
        .art-card img { transition: transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94); display:block; width:100%; }
        .art-card:hover img { transform: scale(1.04); }
        .art-overlay { position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.2) 50%, transparent 100%); opacity:0; transition:opacity 0.4s ease; display:flex; align-items:flex-end; padding:20px; }
        .art-card:hover .art-overlay { opacity:1; }
        .gold-line { display:block; width:40px; height:1px; background:${GOLD}; margin:0 auto 24px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.8s ease forwards; }
        .section-divider { display:flex; align-items:center; gap:16px; margin:48px 0 32px; }
        .section-divider::before,.section-divider::after { content:''; flex:1; height:1px; background:rgba(201,168,76,0.2); }
      `}</style>

      {/* ── Hero ── */}
      <div style={{ minHeight:"60vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", padding:"80px 24px 60px", borderBottom:`1px solid rgba(201,168,76,0.15)`, position:"relative", overflow:"hidden" }}>
        {/* background texture */}
        <div style={{ position:"absolute", inset:0, backgroundImage:`radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)`, pointerEvents:"none" }}/>

        <p className="fade-up" style={{ fontFamily:"'DM Mono', monospace", fontSize:"10px", letterSpacing:"4px", color:GOLD, marginBottom:"24px", opacity:0.8, animationDelay:"0.1s" }}>
          {academy.toUpperCase()} · STUDENT PORTFOLIO
        </p>
        <h1 className="fade-up" style={{ fontFamily:"'Playfair Display', serif", fontSize:"clamp(42px,8vw,96px)", fontWeight:400, lineHeight:1.05, marginBottom:"16px", animationDelay:"0.2s" }}>
          {student?.first_name}<br/>
          <em style={{ fontStyle:"italic", color:GOLD }}>{student?.last_name}</em>
        </h1>
        <span className="gold-line fade-up" style={{ animationDelay:"0.4s" }}/>
        <div className="fade-up" style={{ display:"flex", gap:"32px", fontSize:"11px", letterSpacing:"2px", color:"rgba(240,235,224,0.4)", animationDelay:"0.5s" }}>
          {student?.skill_level && <span>{student.skill_level.toUpperCase()}</span>}
          <span>{artworks?.length ?? 0} WORKS</span>
          <span>{year}</span>
        </div>
      </div>

      {isLoading && (
        <div style={{ textAlign:"center", padding:"80px", color:"rgba(240,235,224,0.3)", fontFamily:"'DM Mono',monospace", fontSize:"12px", letterSpacing:"2px" }}>
          LOADING COLLECTION…
        </div>
      )}

      <div style={{ maxWidth:"1200px", margin:"0 auto", padding:"0 24px 80px" }}>

        {/* ── Featured Works ── */}
        {featured.length > 0 && (
          <>
            <div className="section-divider">
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", letterSpacing:"3px", color:GOLD, whiteSpace:"nowrap" }}>FEATURED WORKS</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns: featured.length === 1 ? "1fr" : "repeat(auto-fit,minmax(380px,1fr))", gap:"3px" }}>
              {featured.map((a: any) => (
                <div key={a.id} className="art-card" style={{ aspectRatio: featured.length === 1 ? "16/9" : "4/5", background:"#111" }}>
                  {a.file_url
                    ? <img src={a.file_url} alt={a.title} style={{ height:"100%", objectFit:"cover" }}/>
                    : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"48px", color:"rgba(255,255,255,0.1)" }}>🎨</div>
                  }
                  <div className="art-overlay">
                    <div>
                      <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"22px", marginBottom:"4px" }}>{a.title}</p>
                      {a.medium && <p style={{ fontSize:"11px", letterSpacing:"2px", color:GOLD, opacity:0.8 }}>{a.medium.toUpperCase()}</p>}
                    </div>
                  </div>
                  <div style={{ position:"absolute", top:"16px", right:"16px", background:GOLD, color:"#000", fontSize:"9px", padding:"4px 10px", letterSpacing:"2px", fontWeight:600 }}>FEATURED</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── All Works ── */}
        {rest.length > 0 && (
          <>
            <div className="section-divider">
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", letterSpacing:"3px", color:"rgba(240,235,224,0.3)", whiteSpace:"nowrap" }}>COLLECTION</span>
            </div>
            <div style={{ columns:"2", columnGap:"3px" }}>
              {rest.map((a: any) => (
                <div key={a.id} className="art-card" style={{ marginBottom:"3px", breakInside:"avoid", background:"#111" }}>
                  {a.file_url
                    ? <img src={a.file_url} alt={a.title}/>
                    : <div style={{ aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"48px", color:"rgba(255,255,255,0.1)" }}>🎨</div>
                  }
                  <div className="art-overlay">
                    <div>
                      <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"18px", marginBottom:"4px" }}>{a.title}</p>
                      {a.medium && <p style={{ fontSize:"10px", letterSpacing:"2px", color:GOLD, opacity:0.8 }}>{a.medium.toUpperCase()}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!isLoading && !artworks?.length && (
          <div style={{ textAlign:"center", padding:"120px 0", color:"rgba(240,235,224,0.2)", fontFamily:"'Playfair Display',serif", fontSize:"24px", fontStyle:"italic" }}>
            No works shared yet
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop:`1px solid rgba(201,168,76,0.15)`, padding:"32px 24px", textAlign:"center", display:"flex", flexDirection:"column", gap:"8px" }}>
        <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"14px", color:GOLD, letterSpacing:"1px" }}>{academy}</p>
        <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", letterSpacing:"2px", color:"rgba(240,235,224,0.2)" }}>© {year} · ALL RIGHTS RESERVED</p>
      </div>
    </div>
  );
}

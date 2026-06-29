import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

export const Route = createFileRoute("/portfolio/gallery/$branch")({ component: AcademyGallery });

const GOLD = "#c9a84c";
const BG   = "#080808";
const CREAM = "#f0ebe0";

function AcademyGallery() {
  const { branch } = Route.useParams();
  const [activeStudent, setActiveStudent] = useState<string | null>(null);
  const academy = branch === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy";

  const { data: artworks, isLoading } = useQuery({
    queryKey: ["pub-gallery", branch],
    queryFn: async () =>
      (await supabase.from("artwork_portfolio")
        .select("*,students(first_name,last_name,skill_level)")
        .eq("branch_id", branch)
        .eq("is_shared", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })).data ?? [],
  });

  const grouped: Record<string, { student: any; works: any[] }> = {};
  (artworks ?? []).forEach((a: any) => {
    if (!grouped[a.student_id]) grouped[a.student_id] = { student: a.students, works: [] };
    grouped[a.student_id].works.push(a);
  });

  const studentList = Object.entries(grouped);
  const allFeatured = (artworks ?? []).filter((a: any) => a.is_featured);
  const year = new Date().getFullYear();

  return (
    <div style={{ background: BG, color: CREAM, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300&display=swap" rel="stylesheet"/>

      <style>{`
        .art-card { position:relative; overflow:hidden; cursor:pointer; background:#111; }
        .art-card img { display:block; width:100%; height:100%; object-fit:cover; transition:transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94); }
        .art-card:hover img { transform:scale(1.05); }
        .art-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.1) 60%,transparent 100%); opacity:0; transition:opacity 0.4s; display:flex; flex-direction:column; justify-content:flex-end; padding:20px; }
        .art-card:hover .art-overlay { opacity:1; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation:fadeUp 1s ease forwards; }
        .stu-chip { cursor:pointer; padding:8px 20px; border:1px solid rgba(201,168,76,0.2); font-size:11px; letter-spacing:2px; transition:all 0.3s; white-space:nowrap; }
        .stu-chip:hover,.stu-chip.active { border-color:${GOLD}; color:${GOLD}; }
        .section-line { width:1px; height:40px; background:rgba(201,168,76,0.3); margin:0 auto; }
      `}</style>

      {/* ── Grand Header ── */}
      <div style={{ minHeight:"70vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", padding:"100px 24px 60px", borderBottom:`1px solid rgba(201,168,76,0.1)`, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:`radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)`, pointerEvents:"none" }}/>

        <p className="fade-up" style={{ fontFamily:"'DM Mono',monospace", fontSize:"9px", letterSpacing:"6px", color:GOLD, marginBottom:"32px", opacity:0.7, animationDelay:"0s" }}>
          STUDENT EXHIBITION · {year}
        </p>
        <h1 className="fade-up" style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(48px,10vw,120px)", fontWeight:400, lineHeight:0.95, marginBottom:"24px", animationDelay:"0.15s" }}>
          {academy.split(" ").slice(0,-1).join(" ")}<br/>
          <em style={{ fontStyle:"italic", color:GOLD }}>{academy.split(" ").slice(-1)[0]}</em>
        </h1>
        <div className="fade-up" style={{ animationDelay:"0.3s", display:"flex", gap:"0", marginBottom:"40px" }}>
          <span style={{ display:"block", width:"60px", height:"1px", background:GOLD, opacity:0.5 }}/>
        </div>
        <div className="fade-up" style={{ animationDelay:"0.4s", display:"flex", gap:"40px", fontSize:"11px", letterSpacing:"3px", color:"rgba(240,235,224,0.35)" }}>
          <span>{allFeatured.length} FEATURED</span>
          <span>{artworks?.length ?? 0} TOTAL WORKS</span>
          <span>{studentList.length} ARTISTS</span>
        </div>
      </div>

      {/* ── Featured Wall ── */}
      {allFeatured.length > 0 && (
        <div style={{ padding:"0" }}>
          <div style={{ textAlign:"center", padding:"64px 0 40px" }}>
            <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"9px", letterSpacing:"6px", color:GOLD, opacity:0.7 }}>FEATURED WORKS</p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))", gap:"2px" }}>
            {allFeatured.slice(0, 6).map((a: any) => (
              <div key={a.id} className="art-card" style={{ aspectRatio:"3/4" }}>
                {a.file_url
                  ? <img src={a.file_url} alt={a.title}/>
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.05)", fontSize:"64px" }}>🎨</div>
                }
                <div className="art-overlay">
                  <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"20px", marginBottom:"4px" }}>{a.title}</p>
                  <p style={{ fontSize:"10px", letterSpacing:"2px", color:GOLD, opacity:0.9 }}>
                    {a.students?.first_name} {a.students?.last_name}
                    {a.medium ? ` · ${a.medium.toUpperCase()}` : ""}
                  </p>
                </div>
                <div style={{ position:"absolute", top:"14px", right:"14px", background:GOLD, color:"#000", fontSize:"8px", padding:"3px 8px", letterSpacing:"2px", fontWeight:700 }}>★</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Artist Filter ── */}
      {studentList.length > 1 && (
        <div style={{ padding:"64px 24px 40px", textAlign:"center", borderTop:`1px solid rgba(201,168,76,0.08)` }}>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"9px", letterSpacing:"6px", color:"rgba(240,235,224,0.3)", marginBottom:"24px" }}>BROWSE BY ARTIST</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", justifyContent:"center" }}>
            <div className={`stu-chip ${activeStudent === null ? "active" : ""}`}
              style={{ fontFamily:"'DM Mono',monospace", color: activeStudent === null ? GOLD : "rgba(240,235,224,0.4)" }}
              onClick={() => setActiveStudent(null)}>
              ALL ARTISTS
            </div>
            {studentList.map(([sid, { student }]) => (
              <div key={sid}
                className={`stu-chip ${activeStudent === sid ? "active" : ""}`}
                style={{ fontFamily:"'DM Mono',monospace", color: activeStudent === sid ? GOLD : "rgba(240,235,224,0.4)" }}
                onClick={() => setActiveStudent(activeStudent === sid ? null : sid)}>
                {student?.first_name?.toUpperCase()} {student?.last_name?.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Artist Sections ── */}
      <div style={{ maxWidth:"1400px", margin:"0 auto", padding:"0 16px 100px" }}>
        {isLoading && (
          <p style={{ textAlign:"center", padding:"80px", color:"rgba(240,235,224,0.2)", fontFamily:"'DM Mono',monospace", fontSize:"11px", letterSpacing:"3px" }}>LOADING COLLECTION…</p>
        )}

        {studentList
          .filter(([sid]) => activeStudent === null || activeStudent === sid)
          .map(([sid, { student, works }]) => (
            <div key={sid} style={{ marginBottom:"80px" }}>
              {/* Artist header */}
              <div style={{ display:"flex", alignItems:"center", gap:"24px", marginBottom:"32px", paddingTop:"48px", borderTop:`1px solid rgba(201,168,76,0.1)` }}>
                <div style={{ width:"48px", height:"48px", borderRadius:"50%", border:`1px solid rgba(201,168,76,0.3)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontFamily:"'Playfair Display',serif", fontSize:"20px", color:GOLD }}>
                    {student?.first_name?.[0]}
                  </span>
                </div>
                <div>
                  <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:"28px", fontWeight:400, marginBottom:"2px" }}>
                    {student?.first_name} <em style={{ fontStyle:"italic", color:GOLD }}>{student?.last_name}</em>
                  </h2>
                  <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"9px", letterSpacing:"3px", color:"rgba(240,235,224,0.3)" }}>
                    {works.length} WORKS{student?.skill_level ? ` · ${student.skill_level.toUpperCase()}` : ""}
                  </p>
                </div>
              </div>

              {/* Works grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:"3px" }}>
                {works.map((a: any, i: number) => (
                  <div key={a.id} className="art-card"
                    style={{ aspectRatio: i === 0 && works.length > 2 ? "unset" : "4/5", gridColumn: i === 0 && works.length > 2 ? "span 2" : "auto" }}>
                    {a.file_url
                      ? <img src={a.file_url} alt={a.title} style={{ aspectRatio: i === 0 && works.length > 2 ? "16/7" : "4/5" }}/>
                      : <div style={{ aspectRatio:"4/5", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.05)", fontSize:"48px" }}>🎨</div>
                    }
                    <div className="art-overlay">
                      <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"18px", marginBottom:"4px" }}>{a.title}</p>
                      {a.medium && <p style={{ fontSize:"10px", letterSpacing:"2px", color:GOLD, opacity:0.8 }}>{a.medium.toUpperCase()}</p>}
                    </div>
                    {a.is_featured && <div style={{ position:"absolute", top:"12px", right:"12px", color:GOLD, fontSize:"14px" }}>★</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}

        {!isLoading && studentList.length === 0 && (
          <div style={{ textAlign:"center", padding:"120px 0" }}>
            <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"28px", fontStyle:"italic", color:"rgba(240,235,224,0.15)" }}>No works on display yet</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop:`1px solid rgba(201,168,76,0.1)`, padding:"48px 24px", textAlign:"center" }}>
        <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"20px", color:GOLD, marginBottom:"8px", letterSpacing:"1px" }}>{academy}</p>
        <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"9px", letterSpacing:"3px", color:"rgba(240,235,224,0.2)" }}>
          NAIROBI, KENYA · © {year} · ALL RIGHTS RESERVED
        </p>
      </div>
    </div>
  );
}

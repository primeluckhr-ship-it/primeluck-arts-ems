import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/portfolio/gallery/$branch")({ component: AcademyGallery });

const G = "#c9a84c";
const BG = "#060606";
const C = "#ede8dc";

function AcademyGallery() {
  const { branch } = Route.useParams();
  const academy = branch === "dice-arts-nairobi" ? "Dice Arts Academy" : "PrimeLuck Arts Academy";
  const [filter, setFilter] = useState<string>("all");
  const [lightbox, setLightbox] = useState<any>(null);

  const { data: artworks = [], isLoading } = useQuery({
    queryKey: ["pub-gallery", branch],
    queryFn: async () =>
      (await supabase.from("artwork_portfolio")
        .select("*,students(first_name,last_name,skill_level)")
        .eq("branch_id", branch).eq("is_shared", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })).data ?? [],
  });

  const artists = Array.from(new Map(artworks.map((a: any) => [a.student_id, a.students])).entries());
  const filtered = filter === "all" ? artworks : artworks.filter((a: any) => a.student_id === filter);
  const featured = artworks.filter((a: any) => a.is_featured);

  // Lightbox keyboard nav
  const onKey = useCallback((e: KeyboardEvent) => {
    if (!lightbox) return;
    if (e.key === "Escape") setLightbox(null);
    if (e.key === "ArrowRight") {
      const i = filtered.findIndex((a: any) => a.id === lightbox.id);
      if (i < filtered.length - 1) setLightbox(filtered[i + 1]);
    }
    if (e.key === "ArrowLeft") {
      const i = filtered.findIndex((a: any) => a.id === lightbox.id);
      if (i > 0) setLightbox(filtered[i - 1]);
    }
  }, [lightbox, filtered]);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  useEffect(() => {
    document.body.style.overflow = lightbox ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [lightbox]);

  return (
    <div style={{ background: BG, color: C, minHeight: "100vh", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,700;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::selection{background:${G};color:#000}
        .img-card{position:relative;overflow:hidden;cursor:pointer;background:#111}
        .img-card img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.25,.46,.45,.94)}
        .img-card:hover img{transform:scale(1.06)}
        .img-card .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.2) 50%,transparent 100%);opacity:0;transition:opacity .4s;display:flex;flex-direction:column;justify-content:flex-end;padding:20px 18px}
        .img-card:hover .ov{opacity:1}
        .img-card .star{position:absolute;top:12px;right:12px;background:${G};color:#000;font-size:9px;padding:3px 9px;letter-spacing:2px;font-weight:700;font-family:'DM Mono',monospace}
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .ani{animation:fadeIn .7s ease both}
        .pill{cursor:pointer;padding:6px 18px;border:1px solid rgba(201,168,76,.2);font-size:10px;letter-spacing:2px;transition:all .25s;font-family:'DM Mono',monospace;white-space:nowrap;color:rgba(237,232,220,.4)}
        .pill:hover,.pill.on{border-color:${G};color:${G};background:rgba(201,168,76,.06)}
        .lb-btn{background:rgba(255,255,255,.1);border:none;color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;transition:background .2s}
        .lb-btn:hover{background:rgba(255,255,255,.25)}
      `}</style>

      {/* ── HERO ── */}
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"80px 24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(ellipse 80% 60% at 50% -10%, rgba(201,168,76,.09) 0%, transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:`url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a84c' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,pointerEvents:"none"}}/>

        <p className="ani" style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"6px",color:G,marginBottom:"28px",opacity:.7,animationDelay:".05s"}}>
          STUDENT ART EXHIBITION · {new Date().getFullYear()}
        </p>
        <h1 className="ani" style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(52px,11vw,140px)",fontWeight:300,lineHeight:.92,marginBottom:"28px",animationDelay:".15s",letterSpacing:"-2px"}}>
          {academy.split(" ").map((w,i) => (
            <span key={i} style={i === academy.split(" ").length-1 ? {fontStyle:"italic",color:G} : {}}>{w} </span>
          ))}
        </h1>
        <div className="ani" style={{width:"48px",height:"1px",background:G,margin:"0 auto 28px",animationDelay:".3s"}}/>
        <div className="ani" style={{display:"flex",gap:"36px",fontSize:"10px",letterSpacing:"3px",color:"rgba(237,232,220,.3)",fontFamily:"'DM Mono',monospace",animationDelay:".4s"}}>
          <span>{artists.length} ARTISTS</span>
          <span>{featured.length} FEATURED</span>
          <span>{artworks.length} WORKS</span>
        </div>
        <div className="ani" style={{position:"absolute",bottom:"32px",left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:"6px",animationDelay:".6s"}}>
          <p style={{fontSize:"9px",letterSpacing:"3px",color:"rgba(237,232,220,.2)",fontFamily:"'DM Mono',monospace"}}>SCROLL</p>
          <div style={{width:"1px",height:"40px",background:`linear-gradient(to bottom, ${G}, transparent)`}}/>
        </div>
      </div>

      {/* ── FEATURED WALL ── */}
      {featured.length > 0 && (
        <section style={{borderTop:`1px solid rgba(201,168,76,.08)`}}>
          <div style={{textAlign:"center",padding:"64px 0 40px"}}>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"6px",color:G,opacity:.7}}>FEATURED WORKS</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(featured.length,3)},1fr)`,gap:"2px"}}>
            {featured.slice(0,6).map((a:any) => (
              <div key={a.id} className="img-card" style={{aspectRatio:"2/3"}} onClick={() => setLightbox(a)}>
                {a.file_url ? <img src={a.file_url} alt={a.title}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,.05)",fontSize:"80px"}}>🎨</div>}
                <div className="ov">
                  <p style={{fontFamily:"'Playfair Display',serif",fontSize:"22px",fontWeight:400,marginBottom:"4px"}}>{a.title}</p>
                  <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:G}}>{a.students?.first_name?.toUpperCase()} {a.students?.last_name?.toUpperCase()}{a.medium ? ` · ${a.medium.toUpperCase()}`:""}</p>
                </div>
                <div className="star">★ FEATURED</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FILTER BAR ── */}
      <div style={{position:"sticky",top:0,zIndex:10,background:`${BG}dd`,backdropFilter:"blur(20px)",borderBottom:`1px solid rgba(201,168,76,.07)`,padding:"16px 24px"}}>
        <div style={{maxWidth:"1400px",margin:"0 auto",display:"flex",gap:"8px",overflowX:"auto",paddingBottom:"4px"}}>
          <div className={`pill ${filter==="all"?"on":""}`} onClick={()=>setFilter("all")}>ALL WORKS</div>
          {artists.map(([sid,s]:any) => (
            <div key={sid} className={`pill ${filter===sid?"on":""}`} onClick={()=>setFilter(filter===sid?"all":sid)}>
              {s?.first_name?.toUpperCase()} {s?.last_name?.toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* ── MASONRY GRID ── */}
      <div style={{maxWidth:"1400px",margin:"0 auto",padding:"48px 16px 100px"}}>
        {isLoading && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"3px"}}>
            {[...Array(9)].map((_,i) => <div key={i} style={{aspectRatio:"3/4",background:"rgba(255,255,255,.04)",borderRadius:"2px"}}/>)}
          </div>
        )}

        {/* Group by artist if showing all */}
        {filter === "all" ? (
          artists.map(([sid, student]: any) => {
            const works = filtered.filter((a: any) => a.student_id === sid);
            if (!works.length) return null;
            return (
              <div key={sid} style={{marginBottom:"72px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"16px",marginBottom:"28px",paddingBottom:"20px",borderBottom:`1px solid rgba(201,168,76,.08)`}}>
                  <div style={{width:"52px",height:"52px",borderRadius:"50%",border:`1px solid rgba(201,168,76,.3)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:"rgba(201,168,76,.05)"}}>
                    <span style={{fontFamily:"'Playfair Display',serif",fontSize:"22px",color:G,fontStyle:"italic"}}>{student?.first_name?.[0]}</span>
                  </div>
                  <div>
                    <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(24px,4vw,36px)",fontWeight:300}}>
                      {student?.first_name} <em style={{fontStyle:"italic",color:G}}>{student?.last_name}</em>
                    </h2>
                    <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"3px",color:"rgba(237,232,220,.3)",marginTop:"2px"}}>
                      {works.length} WORKS{student?.skill_level?` · ${student.skill_level.toUpperCase()}`:""}
                    </p>
                  </div>
                </div>
                <div style={{columns:window.innerWidth>900?"3":"2",columnGap:"3px"}}>
                  {works.map((a:any,i:number) => (
                    <div key={a.id} className="img-card ani" style={{marginBottom:"3px",breakInside:"avoid",animationDelay:`${i*0.05}s`}} onClick={() => setLightbox(a)}>
                      {a.file_url ? <img src={a.file_url} alt={a.title}/> : <div style={{aspectRatio:"4/3",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,.05)",fontSize:"48px"}}>🎨</div>}
                      <div className="ov">
                        <p style={{fontFamily:"'Playfair Display',serif",fontSize:"18px"}}>{a.title}</p>
                        {a.medium && <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:G,marginTop:"3px"}}>{a.medium.toUpperCase()}</p>}
                      </div>
                      {a.is_featured && <div className="star">★</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{columns:window.innerWidth>900?"3":"2",columnGap:"3px"}}>
            {filtered.map((a:any,i:number) => (
              <div key={a.id} className="img-card ani" style={{marginBottom:"3px",breakInside:"avoid",animationDelay:`${i*0.04}s`}} onClick={() => setLightbox(a)}>
                {a.file_url ? <img src={a.file_url} alt={a.title}/> : <div style={{aspectRatio:"4/3",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,.05)",fontSize:"48px"}}>🎨</div>}
                <div className="ov">
                  <p style={{fontFamily:"'Playfair Display',serif",fontSize:"18px"}}>{a.title}</p>
                  {a.medium && <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:G,marginTop:"3px"}}>{a.medium.toUpperCase()}</p>}
                </div>
                {a.is_featured && <div className="star">★</div>}
              </div>
            ))}
          </div>
        )}

        {!isLoading && !artworks.length && (
          <div style={{textAlign:"center",padding:"120px 0"}}>
            <p style={{fontFamily:"'Playfair Display',serif",fontSize:"32px",fontWeight:300,fontStyle:"italic",color:"rgba(237,232,220,.1)"}}>No works on display yet</p>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{borderTop:`1px solid rgba(201,168,76,.08)`,padding:"52px 24px",textAlign:"center",display:"flex",flexDirection:"column",gap:"10px"}}>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:"22px",fontWeight:300,color:G,letterSpacing:"1px"}}>{academy}</p>
        <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"4px",color:"rgba(237,232,220,.2)"}}>NAIROBI, KENYA · © {new Date().getFullYear()} · ALL RIGHTS RESERVED</p>
      </div>

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.97)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setLightbox(null)}>
          <div style={{position:"absolute",top:"20px",right:"20px",display:"flex",gap:"10px",zIndex:2}}>
            <button className="lb-btn" onClick={()=>setLightbox(null)} style={{fontSize:"22px"}}>✕</button>
          </div>
          {/* prev/next */}
          {filtered.findIndex((a:any)=>a.id===lightbox.id) > 0 && (
            <button className="lb-btn" style={{position:"absolute",left:"20px"}} onClick={e=>{e.stopPropagation();const i=filtered.findIndex((a:any)=>a.id===lightbox.id);setLightbox(filtered[i-1])}}>‹</button>
          )}
          {filtered.findIndex((a:any)=>a.id===lightbox.id) < filtered.length-1 && (
            <button className="lb-btn" style={{position:"absolute",right:"20px"}} onClick={e=>{e.stopPropagation();const i=filtered.findIndex((a:any)=>a.id===lightbox.id);setLightbox(filtered[i+1])}}>›</button>
          )}
          <div style={{maxWidth:"min(90vw,900px)",maxHeight:"90vh",display:"flex",flexDirection:"column",gap:"16px",padding:"20px"}} onClick={e=>e.stopPropagation()}>
            {lightbox.file_url && <img src={lightbox.file_url} alt={lightbox.title} style={{maxWidth:"100%",maxHeight:"75vh",objectFit:"contain",display:"block",margin:"0 auto"}}/>}
            <div style={{textAlign:"center"}}>
              <p style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(20px,3vw,32px)",fontWeight:300,marginBottom:"6px"}}>{lightbox.title}</p>
              <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"3px",color:G}}>
                {lightbox.students?.first_name} {lightbox.students?.last_name}
                {lightbox.medium ? ` · ${lightbox.medium.toUpperCase()}`:""}
                {lightbox.description && ` · ${lightbox.description}`}
              </p>
              <p style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:"rgba(237,232,220,.2)",marginTop:"8px"}}>
                {filtered.findIndex((a:any)=>a.id===lightbox.id)+1} / {filtered.length} · ESC TO CLOSE · ← → TO NAVIGATE
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

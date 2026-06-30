import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge } from "@/components/app-shell";
import { Star, Sparkles, Loader2, CheckCircle2, MessageSquare, Link2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/reviews")({ component: FeedbackAdminPage });

const STATUS_COLORS: Record<string,string> = {
  new:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  reviewed: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-success/15 text-success border-success/30",
};
const CAT_LABELS: Record<string,string> = {
  general:"General", instructor:"Instructor", facility:"Facility",
  billing:"Billing", class_content:"Class Content", other:"Other",
};

function FeedbackAdminPage() {
  const { user, activeBranch } = useAuth();
  const revBranch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["feedback-list", revBranch],
    queryFn: async () => {
      let q = supabase.from("feedback").select("*").order("created_at", { ascending: false });
      if (revBranch) q = q.eq("branch_id", revBranch);
      return (await q).data ?? [];
    },
  });

  const filtered = (data??[]).filter((f:any) => filter==="all" || f.status===filter);
  const newCount = (data??[]).filter((f:any) => f.status==="new").length;

  // Copy shareable feedback link
  function copyLink(branch?: string) {
    const base = window.location.origin;
    const url  = branch ? `${base}/feedback?branch=${branch}` : `${base}/feedback`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  }

  return (
    <div className="space-y-4">
      {/* Share links — super_admin sees both, others see own branch only */}
      <div className={`grid gap-3 ${user?.role === "super_admin" ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-md"}`}>
        {(user?.role === "super_admin" || user?.branch_id === "branch-1") && (
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">PrimeLuck Arts Feedback Link</div>
              <div className="text-xs text-muted-foreground mt-0.5">/feedback — share with parents & students</div>
            </div>
            <button onClick={() => copyLink()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:border-accent hover:text-accent transition-colors">
              <Link2 className="size-3.5"/>Copy
            </button>
          </div>
        )}
        {(user?.role === "super_admin" || user?.branch_id === "dice-arts-nairobi") && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">Dice Arts Feedback Link</div>
              <div className="text-xs text-muted-foreground mt-0.5">/feedback?branch=dice — share with partners & students</div>
            </div>
            <button onClick={() => copyLink("dice")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent/30 text-accent text-sm hover:bg-accent/10 transition-colors">
              <Link2 className="size-3.5"/>Copy
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Feedback list */}
        <div className="lg:col-span-1 space-y-3">
          <PageCard title="Feedback" subtitle={`${newCount} new · ${data?.length??0} total`}>
            <div className="flex gap-1 mb-3 flex-wrap">
              {["all","new","reviewed","resolved"].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs capitalize ${filter===f?"bg-accent text-accent-foreground":"bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
            {isLoading && <p className="text-center text-muted-foreground py-4">Loading…</p>}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map((fb:any) => (
                <button key={fb.id} onClick={() => setSelected(fb)}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${selected?.id===fb.id?"border-accent bg-accent/5":"border-border hover:border-accent/40"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{fb.name||"Anonymous"}</div>
                      <div className="text-xs text-muted-foreground">{CAT_LABELS[fb.category]??fb.category}</div>
                    </div>
                    <Badge className={STATUS_COLORS[fb.status]??""}>{fb.status}</Badge>
                  </div>
                  {fb.rating && (
                    <div className="flex gap-0.5 mt-1.5">
                      {[1,2,3,4,5].map((n) => <Star key={n} className={`size-3 ${fb.rating>=n?"text-accent":"text-muted-foreground/30"}`} fill={fb.rating>=n?"currentColor":"none"}/>)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{fb.message}</p>
                  <div className="text-[10px] text-muted-foreground mt-1">{format(new Date(fb.created_at),"d MMM yyyy · HH:mm")}</div>
                </button>
              ))}
              {!isLoading && !filtered.length && <p className="text-center text-muted-foreground py-6 text-sm">No feedback yet</p>}
            </div>
          </PageCard>
        </div>

        {/* Detail + AI panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <FeedbackDetail feedback={selected} onUpdate={(updated:any) => {
              setSelected(updated);
              qc.invalidateQueries({ queryKey: ["feedback-list"] });
            }}/>
          ) : (
            <div className="rounded-xl border border-border bg-card h-64 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center space-y-2">
                <MessageSquare className="size-10 mx-auto opacity-30"/>
                <p>Select a feedback to review</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackDetail({ feedback, onUpdate }: { feedback: any; onUpdate: (f:any) => void }) {
  const [aiLoading, setAiLoading] = useState<"summarize"|"suggest"|null>(null);
  const [adminResponse, setAdminResponse] = useState(feedback.admin_response ?? "");
  const [saving, setSaving] = useState(false);

  async function runAI(mode: "summarize"|"suggest") {
    setAiLoading(mode);
    try {
      const prompt = mode === "summarize"
        ? `Summarize this feedback in 2-3 concise sentences, identifying the key concern:\n\n"${feedback.message}"\n\nCategory: ${feedback.category}\nRating: ${feedback.rating ?? "not given"}/5`
        : `Based on this feedback from a parent/student at an arts academy, provide a practical, empathetic suggested response or action plan in 3-4 sentences:\n\n"${feedback.message}"\n\nCategory: ${feedback.category}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      const field = mode === "summarize" ? "ai_summary" : "ai_suggestion";
      await supabase.from("feedback").update({ [field]: text }).eq("id", feedback.id);
      onUpdate({ ...feedback, [field]: text });
      toast.success(mode === "summarize" ? "Summary generated" : "Suggestion generated");
    } catch (e:any) { toast.error(e.message); } finally { setAiLoading(null); }
  }

  async function updateStatus(status: string) {
    await supabase.from("feedback").update({ status }).eq("id", feedback.id);
    onUpdate({ ...feedback, status });
    toast.success("Status updated");
  }

  async function saveResponse() {
    setSaving(true);
    try {
      await supabase.from("feedback").update({ admin_response: adminResponse, status:"reviewed" }).eq("id", feedback.id);
      onUpdate({ ...feedback, admin_response: adminResponse, status: "reviewed" });
      toast.success("Response saved");
    } catch (e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <PageCard>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{feedback.name||"Anonymous"}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {feedback.email && <span className="text-xs text-muted-foreground">{feedback.email}</span>}
              {feedback.phone && <span className="text-xs text-muted-foreground">{feedback.phone}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge className="bg-muted text-muted-foreground border-border">{CAT_LABELS[feedback.category]}</Badge>
              {feedback.rating && (
                <div className="flex gap-0.5">{[1,2,3,4,5].map((n)=><Star key={n} className={`size-3.5 ${feedback.rating>=n?"text-accent":"text-muted-foreground/30"}`} fill={feedback.rating>=n?"currentColor":"none"}/>)}</div>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {["new","reviewed","resolved"].map((s) => (
              <button key={s} onClick={() => updateStatus(s)}
                className={`px-2.5 py-1 rounded-md text-xs capitalize border transition-all ${feedback.status===s?"bg-accent text-accent-foreground border-accent":"border-border text-muted-foreground hover:border-accent"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div className="rounded-lg bg-muted/30 border border-border p-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{feedback.message}</p>
          <div className="text-xs text-muted-foreground mt-2">{format(new Date(feedback.created_at),"EEEE, d MMMM yyyy · HH:mm")}</div>
        </div>

        {/* AI Tools */}
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <Sparkles className="size-4"/>AI Analysis
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => runAI("summarize")} disabled={!!aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent/30 text-accent text-sm hover:bg-accent/10 disabled:opacity-50">
              {aiLoading==="summarize" ? <Loader2 className="size-3.5 animate-spin"/> : <Sparkles className="size-3.5"/>}
              Summarize concern
            </button>
            <button onClick={() => runAI("suggest")} disabled={!!aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent/30 text-accent text-sm hover:bg-accent/10 disabled:opacity-50">
              {aiLoading==="suggest" ? <Loader2 className="size-3.5 animate-spin"/> : <Sparkles className="size-3.5"/>}
              Suggest solution
            </button>
          </div>
          {feedback.ai_summary && (
            <div className="rounded-md bg-background border border-border p-3">
              <div className="text-xs font-medium text-accent mb-1.5">AI Summary</div>
              <p className="text-sm text-muted-foreground">{feedback.ai_summary}</p>
            </div>
          )}
          {feedback.ai_suggestion && (
            <div className="rounded-md bg-background border border-border p-3">
              <div className="text-xs font-medium text-accent mb-1.5">Suggested Action</div>
              <p className="text-sm text-muted-foreground">{feedback.ai_suggestion}</p>
            </div>
          )}
        </div>

        {/* Admin response */}
        <div>
          <label className="text-sm font-medium block mb-1.5">Internal notes / response</label>
          <textarea value={adminResponse} onChange={(e) => setAdminResponse(e.target.value)}
            rows={3} placeholder="Add your notes or response here…"
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm resize-none"/>
          <button onClick={saveResponse} disabled={saving}
            className="mt-2 px-4 py-2 rounded-md bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save notes"}
          </button>
        </div>
      </div>
    </PageCard>
  );
}

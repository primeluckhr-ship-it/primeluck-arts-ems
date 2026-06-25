import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/app-shell";
import { Star, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/feedback")({ component: FeedbackPage, ssr: false });

const CATEGORIES = [
  { value:"general",       label:"General" },
  { value:"instructor",    label:"Instructor / Teaching" },
  { value:"facility",      label:"Facility / Studio" },
  { value:"billing",       label:"Fees / Billing" },
  { value:"class_content", label:"Class Content" },
  { value:"other",         label:"Other" },
];

export default function FeedbackPage() {
  const [form, setForm] = useState({ name:"", email:"", phone:"", category:"general", message:"", rating:0, branch:"" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Auto-detect branch from URL param
  const params = new URLSearchParams(window.location.search);
  const branchParam = params.get("branch") ?? "";
  const isDice = branchParam === "dice";
  const branchId = isDice ? "dice-arts-nairobi" : null;
  const schoolName = isDice ? "Dice Arts Academy" : "PrimeLuck Arts Academy";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.message.trim()) { toast.error("Please enter your message"); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("feedback").insert({
        ...form, branch_id: branchId, rating: form.rating || null,
      });
      if (error) throw error;
      setDone(true);
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse at top, #2d1b69 0%, #0f0a1e 60%)" }}>
      <div className="text-center space-y-4 max-w-sm">
        <CheckCircle2 className="size-16 text-success mx-auto"/>
        <h1 className="text-2xl font-bold">Thank you!</h1>
        <p className="text-muted-foreground">Your feedback has been received. We appreciate you taking the time to share your thoughts.</p>
        <p className="text-sm text-accent">{schoolName}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-4 py-10"
      style={{ background: "radial-gradient(ellipse at top, #2d1b69 0%, #0f0a1e 60%)" }}>
      <div className="max-w-lg mx-auto">
        <div className="flex flex-col items-center mb-6">
          <Logo size={64}/>
          <h1 className="mt-3 text-xl font-black">{schoolName}</h1>
          <p className="text-sm text-accent mt-1">Share your feedback</p>
        </div>

        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">We'd love to hear from you</h2>
          <p className="text-sm text-muted-foreground">Your feedback helps us improve. You can submit anonymously.</p>

          {/* Star rating */}
          <div>
            <label className="text-sm font-medium block mb-2">Overall rating (optional)</label>
            <div className="flex gap-2">
              {[1,2,3,4,5].map((n) => (
                <button key={n} type="button" onClick={() => setForm({...form, rating: n})}
                  className={`transition-transform hover:scale-110 ${form.rating >= n ? "text-accent" : "text-muted-foreground/40"}`}>
                  <Star className="size-7" fill={form.rating >= n ? "currentColor" : "none"}/>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setForm({...form, category: c.value})}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.category===c.value ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground hover:border-accent"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Your message *</label>
            <textarea value={form.message} onChange={(e) => setForm({...form, message: e.target.value})}
              required rows={5} placeholder="Share your thoughts, suggestions or concerns…"
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"/>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Optional — leave blank to stay anonymous</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { label:"Your name", field:"name", placeholder:"e.g. Jane Doe" },
                { label:"Email", field:"email", placeholder:"jane@example.com" },
                { label:"Phone / WhatsApp", field:"phone", placeholder:"+2547…" },
              ].map((f) => (
                <div key={f.field} className={f.field==="phone" ? "sm:col-span-2" : ""}>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{f.label}</label>
                  <input type="text" value={(form as any)[f.field]} placeholder={f.placeholder}
                    onChange={(e) => setForm({...form, [f.field]: e.target.value})}
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"/>
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground font-semibold py-2.5 hover:opacity-90 disabled:opacity-50 transition">
            <Send className="size-4"/>
            {submitting ? "Sending…" : "Submit Feedback"}
          </button>
        </form>
      </div>
    </div>
  );
}

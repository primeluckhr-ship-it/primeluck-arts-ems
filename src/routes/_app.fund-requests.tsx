import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageCard, Badge, StatCard } from "@/components/app-shell";
import { formatKES } from "@/lib/pla";
import { Plus, CheckCircle2, XCircle, Clock, AlertCircle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Field, Input } from "./_app.students";

export const Route = createFileRoute("/_app/fund-requests")({ component: FundRequestsPage });

const STATUS_COLORS: Record<string,string> = {
  pending:  "bg-warning/15 text-warning border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-danger/15 text-danger border-danger/30",
};
const URGENCY_COLORS: Record<string,string> = {
  low:    "bg-muted text-muted-foreground border-border",
  normal: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  urgent: "bg-danger/15 text-danger border-danger/30",
};
const EXPENSE_CATS = ["Supplies","Equipment","Transport","Printing","Refreshments","Software","Maintenance","Other"];

function FundRequestsPage() {
  const { user, activeBranch } = useAuth();
  const frBranch = user?.role === "super_admin" ? activeBranch : user?.branch_id ?? "";
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const isAdmin = ["super_admin","finance_admin","dice_admin"].includes(user?.role??"");
  const isInstructor = ["instructor","teacher"].includes(user?.role??"");

  const { data, isLoading } = useQuery({
    queryKey: ["fund-requests", user?.id, user?.role],
    queryFn: async () => {
      let q = supabase.from("fund_requests")
        .select("*,instructors(first_name,last_name,email,branch_id),users(first_name,last_name)")
        .order("created_at", { ascending: false });
      // Scope to the active branch (super_admin uses the branch switcher)
      if (frBranch) q = q.eq("branch_id", frBranch);
      if (!isAdmin) {
        // Instructors see only their own requests
        const lookupId = user?.linked_entity_id || 
          (await supabase.from("instructors").select("id").eq("email", user?.email ?? "").limit(1))
            .data?.[0]?.id;
        if (lookupId) q = q.eq("instructor_id", lookupId);
      } else if (user?.role === "dice_admin") {
        q = q.eq("branch_id", user.branch_id);
      }
      return (await q).data ?? [];
    },
  });

  const pending  = (data??[]).filter((r:any) => r.status==="pending");
  const approved = (data??[]).filter((r:any) => r.status==="approved");
  const totalPending = pending.reduce((s:number,r:any) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pending Requests" value={pending.length} icon={<Clock className="size-5"/>} tone="warning"/>
        <StatCard label="Pending Amount" value={formatKES(totalPending)} icon={<Wallet className="size-5"/>} tone="warning"/>
        <StatCard label="Approved (All)" value={approved.length} icon={<CheckCircle2 className="size-5"/>} tone="success"/>
      </div>

      <PageCard title="Fund Requests"
        subtitle={isAdmin ? "Approve or reject instructor requests" : "Your funding requests"}
        action={
          isInstructor && (
            <button onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium">
              <Plus className="size-4"/>New Request
            </button>
          )
        }>
        {isLoading && <p className="py-6 text-center text-muted-foreground">Loading…</p>}
        <div className="space-y-3">
          {(data??[]).map((req:any) => (
            <RequestCard key={req.id} request={req} isAdmin={isAdmin}
              onUpdate={() => qc.invalidateQueries({ queryKey: ["fund-requests"] })}/>
          ))}
          {!isLoading && !data?.length && (
            <p className="py-8 text-center text-muted-foreground">
              {isAdmin ? "No fund requests yet" : "You haven't made any requests yet"}
            </p>
          )}
        </div>
      </PageCard>

      {open && <RequestForm onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["fund-requests"] }); }}/>}
    </div>
  );
}

function RequestCard({ request: req, isAdmin, onUpdate }: { request:any; isAdmin:boolean; onUpdate:()=>void }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const { user } = useAuth();

  async function approve() {
    setProcessing(true);
    try {
      // Create expenditure record automatically
      const { data: exp, error: expErr } = await supabase.from("expenditures").insert({
        branch_id:      req.branch_id,
        category:       req.category.toLowerCase().replace(/ /g,"_"),
        description:    `[Fund Request] ${req.description}`,
        amount:         req.amount,
        expense_date:   new Date().toISOString().slice(0,10),
        payment_method: "cash",
        approved_by:    user?.id,
        created_by:     user?.id,
      }).select("id").single();
      if (expErr) throw expErr;

      // Approve the request and link the expenditure
      const { error } = await supabase.from("fund_requests").update({
        status: "approved",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        expenditure_id: exp.id,
        rejection_reason: null,
      }).eq("id", req.id);
      if (error) throw error;

      toast.success(`Approved — KES ${Number(req.amount).toLocaleString()} recorded as expenditure`);
      onUpdate();
    } catch (e:any) { toast.error(e.message); } finally { setProcessing(false); }
  }

  async function reject() {
    setProcessing(true);
    try {
      const { error } = await supabase.from("fund_requests").update({
        status: "rejected",
        approved_by: user?.id,
        rejection_reason: rejectReason,
      }).eq("id", req.id);
      if (error) throw error;
      toast.success("Request rejected");
      setRejecting(false);
      onUpdate();
    } catch (e:any) { toast.error(e.message); } finally { setProcessing(false); }
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${req.status==="pending" && isAdmin ? "border-warning/30 bg-warning/5" : "border-border bg-background"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{req.description}</span>
            <Badge className={URGENCY_COLORS[req.urgency]}>{req.urgency}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className="bg-muted text-muted-foreground border-border text-xs">{req.category}</Badge>
            {req.instructors && (
              <span className="text-xs text-muted-foreground">by {req.instructors.first_name} {req.instructors.last_name}</span>
            )}
            <span className="text-xs text-muted-foreground">{format(new Date(req.created_at), "d MMM yyyy")}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-lg font-bold text-accent">{formatKES(req.amount)}</span>
          <Badge className={STATUS_COLORS[req.status]}>{req.status}</Badge>
        </div>
      </div>

      {req.status === "approved" && req.expenditure_id && (
        <div className="flex items-center gap-2 text-xs text-success bg-success/10 rounded-md px-3 py-1.5">
          <CheckCircle2 className="size-3.5"/>
          Auto-recorded as expenditure · {format(new Date(req.approved_at), "d MMM yyyy")}
        </div>
      )}
      {req.status === "rejected" && req.rejection_reason && (
        <div className="flex items-center justify-between gap-2 text-xs text-danger bg-danger/10 rounded-md px-3 py-1.5">
          <span className="flex items-center gap-2"><XCircle className="size-3.5"/>Rejected: {req.rejection_reason}</span>
          {isAdmin && (
            <button onClick={approve} disabled={processing}
              className="shrink-0 text-success underline hover:no-underline disabled:opacity-50">
              Reconsider & Approve
            </button>
          )}
        </div>
      )}

      {/* Admin approve/reject buttons */}
      {isAdmin && req.status === "pending" && !rejecting && (
        <div className="flex gap-2 pt-1">
          <button onClick={approve} disabled={processing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md bg-success/15 text-success border border-success/30 text-sm font-medium hover:bg-success/25 disabled:opacity-50">
            <CheckCircle2 className="size-4"/>Approve
          </button>
          <button onClick={() => setRejecting(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md bg-danger/10 text-danger border border-danger/30 text-sm font-medium hover:bg-danger/20">
            <XCircle className="size-4"/>Reject
          </button>
        </div>
      )}
      {isAdmin && req.status === "pending" && rejecting && (
        <div className="space-y-2 pt-1">
          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)"
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm"/>
          <div className="flex gap-2">
            <button onClick={reject} disabled={processing}
              className="flex-1 py-2 rounded-md bg-danger/15 text-danger border border-danger/30 text-sm font-medium hover:bg-danger/25 disabled:opacity-50">
              Confirm Reject
            </button>
            <button onClick={() => setRejecting(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestForm({ onClose, onSaved }: { onClose:()=>void; onSaved:()=>void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ category:"Supplies", description:"", amount:"", urgency:"normal" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.description || !form.amount) { toast.error("Fill all required fields"); return; }
    setSaving(true);
    try {
      // Lookup instructor: by linked_entity_id first, then email
      let instructorId = user?.linked_entity_id;
      if (!instructorId) {
        const { data: inst } = await supabase.from("instructors").select("id").eq("email", user?.email ?? "").limit(1);
        instructorId = inst?.[0]?.id ?? null;
      }
      if (!instructorId) { toast.error("Your instructor profile is not linked — ask admin to set your linked entity in Settings"); return; }
      const { error } = await supabase.from("fund_requests").insert({
        branch_id: frBranch,
        instructor_id: instructorId,
        category: form.category,
        description: form.description,
        amount: Number(form.amount),
        urgency: form.urgency,
      });
      if (error) throw error;
      toast.success("Fund request submitted — pending admin approval");
      onSaved();
    } catch (e:any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Request Funds</h2>
        <div className="space-y-3">
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({...form,category:e.target.value})}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm">
              {EXPENSE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="What do you need? *">
            <textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})}
              rows={3} placeholder="e.g. 20 sheets of watercolour paper A3 for the Thursday class"
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm resize-none"/>
          </Field>
          <Field label="Estimated amount (KES) *">
            <Input type="number" value={form.amount} onChange={(v) => setForm({...form,amount:v})} placeholder="e.g. 2500"/>
          </Field>
          <Field label="Urgency">
            <div className="flex gap-2">
              {["low","normal","urgent"].map((u) => (
                <button key={u} type="button" onClick={() => setForm({...form,urgency:u})}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border capitalize transition-all ${form.urgency===u ? URGENCY_COLORS[u]+" ring-1 ring-current" : "border-border text-muted-foreground"}`}>
                  {u}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium disabled:opacity-50">
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

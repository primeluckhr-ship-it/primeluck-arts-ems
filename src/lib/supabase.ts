import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xgwfodwaczyrnxagyzhl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnd2ZvZHdhY3p5cm54YWd5emhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTk3MjksImV4cCI6MjA5NzY5NTcyOX0.5WYZgeUA6eVw9EOzu9qlA_FUKVIARnfcTDb8VyKNM7M";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});


// ── Audit Log Helper ──────────────────────────────────────────
export async function logAudit(params: {
  user_id?: string | null;
  branch_id?: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  try {
    await supabase.from("audit_logs").insert({
      id: crypto.randomUUID(),
      ...params,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking — never crash the app due to audit logging
  }
}

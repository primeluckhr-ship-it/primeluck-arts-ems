// PrimeLuck Arts shared utilities

export async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatKES(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  if (isNaN(n as number)) return "KES 0.00";
  return `KES ${(n as number).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateReceiptNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RCP-${ymd}-${rand}`;
}

export function generateInvoiceNumber(year?: number, month?: number): string {
  const d = new Date();
  const y = year ?? d.getFullYear();
  const m = month ?? d.getMonth() + 1;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${String(m).padStart(2, "0")}-${rand}`;
}

export function getStatusColor(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (["active", "paid", "present", "completed", "sent"].includes(s))
    return "bg-success/15 text-success border-success/30";
  if (["pending", "draft", "scheduled", "partial", "late", "normal"].includes(s))
    return "bg-warning/15 text-warning border-warning/30";
  if (["overdue", "absent", "cancelled", "inactive", "urgent", "suspended"].includes(s))
    return "bg-danger/15 text-danger border-danger/30";
  if (["high", "excused"].includes(s)) return "bg-accent/15 text-accent border-accent/30";
  return "bg-muted text-muted-foreground border-border";
}

export function csvDownload(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ROLES = ["super_admin", "finance_admin", "teacher", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];

export const roleLabel = (r: string) =>
  ({
    super_admin: "Super Admin",
    finance_admin: "Finance",
    teacher: "Teacher",
    parent: "Parent",
    student: "Student",
  })[r] ?? r;

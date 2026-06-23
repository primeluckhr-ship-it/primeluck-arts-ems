import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/app-shell";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav({ to: "/" }); }, [user, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "radial-gradient(ellipse at top, #2d1b69 0%, #0f0a1e 60%)" }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Logo size={72} />
          <h1 className="mt-4 text-2xl font-black tracking-wide">PRIME LUCK ARTS</h1>
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Academy Management</p>
        </div>
        <form onSubmit={onSubmit} className="bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-lg font-semibold">Sign in</h2>
          <div>
            <label className="text-sm font-medium block mb-1.5">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-background border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="you@primeluckarts.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-background border border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground font-semibold py-2.5 hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading && <Loader2 className="size-4 animate-spin" />} Sign in
          </button>
          <div className="text-xs text-muted-foreground border-t border-border pt-3">
            <div className="font-medium text-foreground mb-1">Demo credential</div>
            admin@primeluckarts.com — use your set password
          </div>
        </form>
      </div>
    </div>
  );
}

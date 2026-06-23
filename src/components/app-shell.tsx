import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, GraduationCap, UserCog, BookOpen, CalendarCheck,
  Wallet, Megaphone, FileText, ShieldCheck, Settings, LogOut, Menu,
  Image as ImageIcon, ClipboardList, Baby, Receipt, CalendarDays, BookMarked,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { roleLabel, type Role } from "@/lib/pla";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: ReactNode; roles: Role[] };

const NAV: Item[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard className="size-5" />, roles: ["super_admin","finance_admin","teacher","parent","student"] },
  { to: "/students", label: "Students", icon: <GraduationCap className="size-5" />, roles: ["super_admin","finance_admin","teacher"] },
  { to: "/parents", label: "Parents", icon: <Users className="size-5" />, roles: ["super_admin"] },
  { to: "/instructors", label: "Instructors", icon: <UserCog className="size-5" />, roles: ["super_admin"] },
  { to: "/courses", label: "Courses", icon: <BookOpen className="size-5" />, roles: ["super_admin","teacher"] },
  { to: "/schedule", label: "My Schedule", icon: <CalendarDays className="size-5" />, roles: ["student"] },
  { to: "/children", label: "My Children", icon: <Baby className="size-5" />, roles: ["parent"] },
  { to: "/attendance", label: "Attendance", icon: <CalendarCheck className="size-5" />, roles: ["super_admin","teacher","student"] },
  { to: "/finance", label: "Finance", icon: <Wallet className="size-5" />, roles: ["super_admin","finance_admin"] },
  { to: "/account", label: "Fee Account", icon: <Receipt className="size-5" />, roles: ["parent","student"] },
  { to: "/programs", label: "Programs", icon: <BookMarked className="size-5" />, roles: ["super_admin"] },
  { to: "/portfolio", label: "Portfolio", icon: <ImageIcon className="size-5" />, roles: ["super_admin","teacher","parent","student"] },
  { to: "/assessments", label: "Assessments", icon: <ClipboardList className="size-5" />, roles: ["super_admin","teacher","parent","student"] },
  { to: "/announcements", label: "Announcements", icon: <Megaphone className="size-5" />, roles: ["super_admin","finance_admin","teacher","parent","student"] },
  { to: "/reports", label: "Reports", icon: <FileText className="size-5" />, roles: ["super_admin","finance_admin"] },
  { to: "/audit", label: "Audit Log", icon: <ShieldCheck className="size-5" />, roles: ["super_admin"] },
  { to: "/settings", label: "Settings", icon: <Settings className="size-5" />, roles: ["super_admin"] },
];

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-black tracking-tight text-accent shrink-0"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 30% 30%, #3a1f7a, #1a0a2e 70%)",
        boxShadow: "0 0 0 1px rgba(212,160,23,0.35), 0 4px 14px rgba(0,0,0,0.4)",
        fontSize: size * 0.38,
      }}
    >
      PLA
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;
  const items = NAV.filter((i) => i.roles.includes(user.role));

  const currentTitle = items.find((i) => i.to === pathname)?.label ?? "PrimeLuck Arts";

  const SidebarBody = (
    <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-2">
      {items.map((item) => {
        const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed && "justify-center px-2",
            )}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 sticky top-0 h-screen",
          collapsed ? "w-16" : "w-[260px]",
        )}
      >
        <div className={cn("flex items-center gap-3 px-4 h-16 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
          <Logo size={36} />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide">PRIME LUCK</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-accent">Arts Academy</div>
            </div>
          )}
        </div>
        {SidebarBody}
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center justify-center gap-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground py-2 rounded-md hover:bg-sidebar-accent"
          >
            <Menu className="size-4" />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 bg-sidebar border-r border-sidebar-border flex flex-col">
            <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
              <Logo size={36} />
              <div className="leading-tight">
                <div className="text-sm font-bold">PRIME LUCK</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-accent">Arts Academy</div>
              </div>
            </div>
            {SidebarBody}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur border-b border-border flex items-center px-4 md:px-6 gap-4">
          <button className="md:hidden p-2 rounded hover:bg-muted" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>
          <h1 className="text-lg font-semibold truncate flex-1">{currentTitle}</h1>
          <span className="hidden sm:inline-flex items-center rounded-full bg-accent/15 text-accent border border-accent/30 px-3 py-1 text-xs font-semibold">
            {roleLabel(user.role)}
          </span>
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-full bg-primary flex items-center justify-center font-semibold text-sm">
              {user.first_name[0]}{user.last_name[0]}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-medium">{user.first_name} {user.last_name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <button
            onClick={() => { logout(); nav({ to: "/login" }); }}
            className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="size-5" />
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-[1600px] w-full">{children}</main>

        {/* Mobile bottom nav: first 5 */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around py-1.5">
          {items.slice(0, 5).map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded text-[10px]",
                  active ? "text-accent" : "text-sidebar-foreground/70",
                )}
              >
                {item.icon}
                <span className="truncate max-w-[70px]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function PageCard({ title, subtitle, action, children }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 shadow-sm">
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = "default" }: { label: string; value: ReactNode; icon: ReactNode; tone?: "default"|"gold"|"success"|"warning"|"danger" }) {
  const tones: Record<string, string> = {
    default: "from-primary/40 to-primary/10 text-foreground",
    gold: "from-accent/30 to-accent/5 text-accent",
    success: "from-success/30 to-success/5 text-success",
    warning: "from-warning/30 to-warning/5 text-warning",
    danger: "from-danger/30 to-danger/5 text-danger",
  };
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-card p-5")}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50 pointer-events-none", tones[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="mt-2 text-2xl font-bold">{value}</div>
        </div>
        <div className="size-10 rounded-lg bg-background/40 border border-border flex items-center justify-center text-accent">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

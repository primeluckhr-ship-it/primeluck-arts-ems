import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, logAudit } from "./supabase";
import { sha256, type Role } from "./pla";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
  branch_id: string | null;
  linked_entity_id: string | null;
}

const BRANCHES = [
  { id: "branch-1",           label: "PrimeLuck Arts", short: "PLA" },
  { id: "dice-arts-nairobi",  label: "Dice Arts",      short: "DICE" },
];

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  // Super-admin branch switcher
  activeBranch: string | null;       // the branch currently being viewed
  setActiveBranch: (b: string) => void;
  branches: typeof BRANCHES;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "pla_session";
const BRANCH_KEY = "pla_active_branch";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBranch, setActiveBranchState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed);
        const savedBranch = localStorage.getItem(BRANCH_KEY);
        const initial = (parsed.role === "super_admin" && savedBranch) ? savedBranch : parsed.branch_id;
        setActiveBranchState(initial);
        document.documentElement.setAttribute("data-brand", initial === "dice-arts-nairobi" ? "dice" : "pla");
      }
    } catch {}
    setLoading(false);
  }, []);

  const setActiveBranch = (b: string) => {
    setActiveBranchState(b);
    localStorage.setItem(BRANCH_KEY, b);
    document.documentElement.setAttribute("data-brand", b === "dice-arts-nairobi" ? "dice" : "pla");
  };

  const login = async (email: string, password: string) => {
    const hash = await sha256(password);
    const { data, error } = await supabase
      .from("users")
      .select("id,email,role,first_name,last_name,branch_id,linked_entity_id,password_hash,is_active")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Invalid email or password");
    if (!data.is_active) throw new Error("Account is inactive");
    if (data.password_hash !== hash) throw new Error("Invalid email or password");
    const su: SessionUser = {
      id: data.id,
      email: data.email,
      role: data.role,
      first_name: data.first_name,
      last_name: data.last_name,
      branch_id: data.branch_id,
      linked_entity_id: data.linked_entity_id,
    };
    localStorage.setItem(KEY, JSON.stringify(su));
    const initial = su.role === "super_admin" ? (localStorage.getItem(BRANCH_KEY) ?? su.branch_id ?? "branch-1") : su.branch_id ?? "branch-1";
    setActiveBranchState(initial);
    document.documentElement.setAttribute("data-brand", initial === "dice-arts-nairobi" ? "dice" : "pla");
    setUser(su);
    return su;
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BRANCH_KEY);
    document.documentElement.removeAttribute("data-brand");
    setUser(null);
    setActiveBranchState(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, activeBranch, setActiveBranch, branches: BRANCHES }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used in AuthProvider");
  return c;
}

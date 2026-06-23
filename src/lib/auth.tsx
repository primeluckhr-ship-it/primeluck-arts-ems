import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
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

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "pla_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

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
    setUser(su);
    return su;
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used in AuthProvider");
  return c;
}

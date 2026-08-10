import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import { api, tokenStore } from "./api";
import type { Role, Staff } from "./types";

interface AuthState {
  staff: Staff | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const STAFF_KEY = "enzi.admin.staff";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STAFF_KEY);
    if (raw && tokenStore.get()) {
      try { setStaff(JSON.parse(raw)); } catch { /* ignore */ }
    }
    setReady(true);
  }, []);

  async function login(email: string, password: string) {
    const { token, staff } = await api.login(email, password);
    tokenStore.set(token);
    localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
    setStaff(staff);
  }

  function logout() {
    tokenStore.clear();
    localStorage.removeItem(STAFF_KEY);
    setStaff(null);
  }

  const can = (roles: Role[]) => !!staff && roles.includes(staff.role);

  return (
    <AuthContext.Provider value={{ staff, ready, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

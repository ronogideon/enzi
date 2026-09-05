import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { api, tokenStore } from "./api";
import type { Role, Staff } from "./types";

interface AuthState {
  staff: Staff | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (roles: Role[]) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const STAFF_KEY = "enzi.admin.staff";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Rehydrate from localStorage first so a refresh doesn't flash the login
   * screen, then confirm with the server. If the account was deactivated or
   * its role changed since the token was issued, the server is the source of
   * truth — a stale cached role must not keep granting access.
   */
  useEffect(() => {
    const raw = localStorage.getItem(STAFF_KEY);
    const token = tokenStore.get();

    if (!token) { setReady(true); return; }
    if (raw) {
      try { setStaff(JSON.parse(raw)); } catch { /* ignore corrupt cache */ }
    }

    api
      .me()
      .then((fresh) => {
        setStaff(fresh);
        localStorage.setItem(STAFF_KEY, JSON.stringify(fresh));
      })
      .catch((e) => {
        // A network blip shouldn't sign you out — only a real rejection does.
        if (e?.name !== "NetworkError") {
          tokenStore.clear();
          localStorage.removeItem(STAFF_KEY);
          setStaff(null);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, staff: signedIn } = await api.login(email, password);
    tokenStore.set(token);
    localStorage.setItem(STAFF_KEY, JSON.stringify(signedIn));
    setStaff(signedIn);
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await api.me();
    setStaff(fresh);
    localStorage.setItem(STAFF_KEY, JSON.stringify(fresh));
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(STAFF_KEY);
    setStaff(null);
  }, []);

  const can = useCallback(
    (roles: Role[]) => !!staff && roles.includes(staff.role),
    [staff]
  );

  return (
    <AuthContext.Provider value={{ staff, ready, login, logout, can, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

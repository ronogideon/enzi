"use client";

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { api, TOKEN_KEY } from "./api";
import type { CustomerAccount } from "./types";

interface AccountState {
  customer: CustomerAccount | null;
  ready: boolean;
  register: (body: {
    name: string; email: string; phone: string; password: string; marketingConsent: boolean;
  }) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountState | null>(null);
const CACHE_KEY = "enzi.customer.profile";

/**
 * Customer sessions are a JWT in localStorage, same as the admin. Accounts are
 * optional throughout — guests can still check out — so nothing here blocks
 * rendering: the shop works identically whether or not someone is signed in.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
      const cached = localStorage.getItem(CACHE_KEY);
      if (token && cached) setCustomer(JSON.parse(cached));
    } catch {
      /* private browsing or blocked storage — carry on as a guest */
    }

    if (!token) {
      setReady(true);
      return;
    }

    api
      .me()
      .then((fresh) => {
        setCustomer(fresh);
        localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CACHE_KEY);
        setCustomer(null);
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((token: string, profile: CustomerAccount) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    setCustomer(profile);
  }, []);

  const register = useCallback(
    async (body: {
      name: string; email: string; phone: string; password: string; marketingConsent: boolean;
    }) => {
      const { token, customer: profile } = await api.register(body);
      persist(token, profile);
    },
    [persist]
  );

  const login = useCallback(
    async (identifier: string, password: string) => {
      const { token, customer: profile } = await api.login(identifier, password);
      persist(token, profile);
    },
    [persist]
  );

  const refresh = useCallback(async () => {
    const fresh = await api.me();
    setCustomer(fresh);
    localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CACHE_KEY);
    setCustomer(null);
  }, []);

  return (
    <AccountContext.Provider value={{ customer, ready, register, login, logout, refresh }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}

/** Shared phone helpers — checkout and registration must agree on the format. */
export function normalizePhone(input: string): string {
  let p = input.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}

export const isValidPhone = (p: string) => /^254(7|1)\d{8}$/.test(normalizePhone(p));

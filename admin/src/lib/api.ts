import type {
  Staff, StaffMember, Category, Product, Promotion, DeliveryMethod, Order,
  Customer, StockAudit, SmsCampaign, StatsOverview, SettingsMap, UploadedImage,
} from "./types";

declare global {
  interface Window { __ENV__?: { API_URL?: string }; }
}

/* ---------------------------------------------------------------------------
 * Resolving the API base URL
 *
 * "Failed to fetch" in the browser means the request never reached a server:
 * wrong host, refused connection, blocked mixed content, or a rejected CORS
 * preflight. The old default here was `http://localhost:4000/api`, so a
 * deployed admin with no API_URL set would quietly try to reach the operator's
 * own laptop — which is exactly what that error looked like.
 *
 * Resolution order now:
 *   1. localStorage override      — set from the login screen when something
 *                                   is misconfigured, so you can get in and
 *                                   fix it without a redeploy.
 *   2. window.__ENV__.API_URL     — written by gen-env.mjs at container start.
 *   3. import.meta.env.VITE_API_URL — build-time fallback.
 *   4. localhost:4000             — ONLY when the page itself is on localhost.
 *   5. same-origin /api           — a sane last resort in production.
 * ------------------------------------------------------------------------- */

const OVERRIDE_KEY = "enzi.admin.apiBase";

/** Trim trailing slashes and make sure the base ends in /api exactly once. */
function normalizeBase(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}

function resolveBase(): string {
  const override = (() => {
    try { return localStorage.getItem(OVERRIDE_KEY); } catch { return null; }
  })();
  if (override) return normalizeBase(override);

  const runtime = window.__ENV__?.API_URL?.trim();
  if (runtime) return normalizeBase(runtime);

  const buildTime = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (buildTime) return normalizeBase(buildTime);

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:4000/api";

  // Deployed with nothing configured. Same-origin is the least-wrong guess and
  // the diagnostics on the login page will say so out loud.
  return `${window.location.origin}/api`;
}

export let BASE = resolveBase();

export const apiBase = {
  get: () => BASE,
  /** Whether the base came from an operator override rather than config. */
  isOverridden: () => {
    try { return !!localStorage.getItem(OVERRIDE_KEY); } catch { return false; }
  },
  isConfigured: () =>
    !!(window.__ENV__?.API_URL?.trim() || (import.meta.env.VITE_API_URL as string | undefined)?.trim()),
  set: (url: string) => {
    localStorage.setItem(OVERRIDE_KEY, url.trim());
    BASE = resolveBase();
    return BASE;
  },
  clear: () => {
    localStorage.removeItem(OVERRIDE_KEY);
    BASE = resolveBase();
    return BASE;
  },
};

const TOKEN_KEY = "enzi.admin.token";
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** A network failure carries the URL it tried, so the cause is visible. */
export class NetworkError extends Error {
  constructor(public url: string, cause?: unknown) {
    super(
      `Can't reach the API at ${url}. ` +
        `The address may be wrong, the backend may be down, or it may be ` +
        `blocking this site (CORS).`
    );
    this.name = "NetworkError";
    if (cause) (this as any).cause = cause;
  }
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown; raw?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    // fetch() only rejects on network-level failure — never on a 4xx/5xx.
    throw new NetworkError(url, e);
  }

  if (res.status === 401 && !path.includes("/auth/")) {
    tokenStore.clear();
    localStorage.removeItem("enzi.admin.staff");
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? `Request failed (${res.status} ${res.statusText})`);
  }

  if (res.status === 204) return undefined as T;
  if (opts.raw) return (await res.blob()) as T;
  return (await res.json()) as T;
}

/** Absolute URL for an image the API serves (product photos live in the API). */
export function mediaUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return `${BASE.replace(/\/api$/, "")}${url}`;
}

export const api = {
  /**
   * Reachability + setup probe for the login screen. Does not need a token.
   * `setupRequired` tells us the staff table is empty, which is the difference
   * between "you typed the wrong password" and "no account has ever existed".
   */
  async health(): Promise<{
    ok: boolean;
    url: string;
    version?: string;
    error?: string;
    setupRequired?: boolean;
    database?: "ok" | "unreachable" | "no-schema";
  }> {
    const url = `${BASE}/health`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok)
        return { ok: false, url, error: `API responded ${res.status} ${res.statusText}` };
      const body = await res.json().catch(() => null);
      if (!body?.ok)
        return {
          ok: false,
          url,
          error: "Something answered, but it isn't the Enzi API. Check the URL.",
        };
      return {
        ok: true,
        url,
        version: body.version,
        setupRequired: body.setupRequired,
        database: body.database,
      };
    } catch {
      return {
        ok: false,
        url,
        error:
          "No response at all. Check that the API URL is right, the backend is " +
          "running, and that it allows requests from this site.",
      };
    }
  },

  // auth
  login: (email: string, password: string) =>
    req<{ token: string; staff: Staff }>("/auth/staff/login", {
      method: "POST",
      body: { email, password },
    }),
  me: () => req<Staff>("/staff/me"),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>("/staff/me/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),

  // staff accounts
  staffList: () => req<StaffMember[]>("/staff"),
  createStaff: (body: unknown) => req<StaffMember>("/staff", { method: "POST", body }),
  updateStaff: (id: string, body: unknown) =>
    req<StaffMember>(`/staff/${id}`, { method: "PATCH", body }),
  resetStaffPassword: (id: string, password: string) =>
    req<{ ok: boolean }>(`/staff/${id}/password`, { method: "POST", body: { password } }),
  deleteStaff: (id: string) =>
    req<{ ok: boolean; deactivated?: boolean }>(`/staff/${id}`, { method: "DELETE" }),

  // dashboard
  statsOverview: () => req<StatsOverview>("/stats/overview"),
  revenueSeries: (days = 30) =>
    req<{ date: string; total: number; orders: number }[]>(`/stats/revenue-series?days=${days}`),
  topProducts: (days = 30) =>
    req<{ productId: string; name: string; unitsSold: number; revenue: number }[]>(
      `/stats/top-products?days=${days}`
    ),

  // catalogue
  categories: () => req<Category[]>("/categories"),
  createCategory: (body: unknown) => req<Category>("/categories", { method: "POST", body }),
  updateCategory: (id: string, body: unknown) =>
    req<Category>(`/categories/${id}`, { method: "PATCH", body }),

  products: (params = "") => req<Product[]>(`/products${params}`),
  allProducts: (search?: string) =>
    req<Product[]>(`/products/admin/all${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createProduct: (body: unknown) => req<Product>("/products", { method: "POST", body }),
  updateProduct: (id: string, body: unknown) =>
    req<Product>(`/products/${id}`, { method: "PATCH", body }),
  hideProduct: (id: string) => req<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" }),
  deleteProductForever: (id: string) =>
    req<{ ok: boolean }>(`/products/${id}?hard=true`, { method: "DELETE" }),
  restoreProduct: (id: string) => req<Product>(`/products/${id}/restore`, { method: "POST" }),
  duplicateProduct: (id: string) => req<Product>(`/products/${id}/duplicate`, { method: "POST" }),

  // images
  uploadImage: (image: { filename: string; data: string; width?: number; height?: number }) =>
    req<UploadedImage>("/media", { method: "POST", body: image }),

  // promotions
  promotions: () => req<Promotion[]>("/promotions"),
  createPromotion: (body: unknown) => req<Promotion>("/promotions", { method: "POST", body }),
  updatePromotion: (id: string, body: unknown) =>
    req<Promotion>(`/promotions/${id}`, { method: "PATCH", body }),

  // delivery
  deliveryMethods: () => req<DeliveryMethod[]>("/delivery-methods"),
  createDeliveryMethod: (body: unknown) =>
    req<DeliveryMethod>("/delivery-methods", { method: "POST", body }),
  updateDeliveryMethod: (id: string, body: unknown) =>
    req<DeliveryMethod>(`/delivery-methods/${id}`, { method: "PATCH", body }),

  // orders
  orders: (params: { status?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.search) q.set("search", params.search);
    const qs = q.toString();
    return req<Order[]>(`/orders${qs ? `?${qs}` : ""}`);
  },
  orderCounts: () => req<Record<string, number>>("/orders/counts"),
  order: (id: string) => req<Order>(`/orders/${id}`),
  advanceOrder: (id: string, to: string, note?: string) =>
    req<Order>(`/orders/${id}/status`, { method: "POST", body: { to, note } }),
  updateOrder: (id: string, body: { trackingRef?: string | null; staffNotes?: string | null }) =>
    req<Order>(`/orders/${id}`, { method: "PATCH", body }),
  markOrderPaid: (id: string, note?: string) =>
    req<Order>(`/orders/${id}/mark-paid`, { method: "POST", body: { note } }),

  // customers (CRM)
  customers: (params: { search?: string; hasAccount?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.hasAccount) q.set("hasAccount", "true");
    const qs = q.toString();
    return req<Customer[]>(`/customers${qs ? `?${qs}` : ""}`);
  },
  customer: (id: string) => req<Customer>(`/customers/${id}`),
  updateCustomer: (id: string, body: unknown) =>
    req<Customer>(`/customers/${id}`, { method: "PATCH", body }),
  customersCsvUrl: () => `${BASE}/customers/export.csv`,
  downloadCustomersCsv: () => req<Blob>("/customers/export.csv", { raw: true }),

  // stock
  restock: (productId: string, quantity: number, note?: string) =>
    req<Product>("/stock/restock", { method: "POST", body: { productId, quantity, note } }),
  openAudit: (note?: string) => req<StockAudit>("/stock/audits", { method: "POST", body: { note } }),
  countAuditItem: (auditId: string, itemId: string, countedQty: number) =>
    req(`/stock/audits/${auditId}/items/${itemId}`, { method: "PATCH", body: { countedQty } }),
  closeAudit: (auditId: string) =>
    req<{ ok: boolean }>(`/stock/audits/${auditId}/close`, { method: "POST" }),

  // sms / campaigns
  smsSegmentPreview: (segment: unknown) =>
    req<{ count: number }>("/sms/segment/preview", { method: "POST", body: segment }),
  smsSend: (phone: string, body: string) =>
    req("/sms/send", { method: "POST", body: { phone, body } }),
  smsCampaigns: () => req<SmsCampaign[]>("/sms/campaigns"),
  createCampaign: (body: unknown) => req<SmsCampaign>("/sms/campaigns", { method: "POST", body }),
  runCampaign: (id: string) =>
    req<{ recipients: number; sent: number; failed: number }>(`/sms/campaigns/${id}/run`, {
      method: "POST",
    }),

  // settings
  settings: () => req<SettingsMap>("/settings"),
  setSetting: (key: string, value: unknown) =>
    req(`/settings/${key}`, { method: "PUT", body: { value } }),
  saveSettings: (values: Record<string, string>) =>
    req<{ ok: boolean; saved: string[] }>("/settings", { method: "PUT", body: { values } }),
  testMpesa: () =>
    req<{ ok: boolean; message?: string; callbackUrl?: string }>("/settings/test/mpesa", {
      method: "POST",
    }),
  testSms: () =>
    req<{ ok: boolean; message?: string }>("/settings/test/sms", { method: "POST" }),
};

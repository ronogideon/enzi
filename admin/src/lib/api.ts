import type {
  Staff, Category, Product, Promotion, DeliveryMethod, Order,
  Customer, StockAudit, SmsCampaign, StatsOverview,
} from "./types";

declare global {
  interface Window { __ENV__?: { API_URL?: string }; }
}

const BASE =
  window.__ENV__?.API_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:4000/api";

const TOKEN_KEY = "enzi.admin.token";
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    tokenStore.clear();
    if (!path.includes("/auth/")) window.location.href = "/login";
  }
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: `Error ${res.status}` }));
    throw new Error(msg.error ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    req<{ token: string; staff: Staff }>("/auth/staff/login", {
      method: "POST",
      body: { email, password },
    }),

  // dashboard
  statsOverview: () => req<StatsOverview>("/stats/overview"),
  revenueSeries: () => req<{ date: string; total: number }[]>("/stats/revenue-series"),

  // catalogue
  categories: () => req<Category[]>("/categories"),
  createCategory: (body: unknown) => req<Category>("/categories", { method: "POST", body }),
  products: (params = "") => req<Product[]>(`/products${params}`),
  createProduct: (body: unknown) => req<Product>("/products", { method: "POST", body }),
  updateProduct: (id: string, body: unknown) =>
    req<Product>(`/products/${id}`, { method: "PATCH", body }),
  deleteProduct: (id: string) => req<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" }),

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
  orders: (status?: string) =>
    req<Order[]>(`/orders${status ? `?status=${status}` : ""}`),
  order: (id: string) => req<Order>(`/orders/${id}`),
  advanceOrder: (id: string, to: string) =>
    req<Order>(`/orders/${id}/status`, { method: "POST", body: { to } }),

  // customers (CRM)
  customers: (search?: string) =>
    req<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  customer: (id: string) => req<Customer>(`/customers/${id}`),
  updateCustomer: (id: string, body: unknown) =>
    req<Customer>(`/customers/${id}`, { method: "PATCH", body }),

  // stock
  restock: (productId: string, quantity: number, note?: string) =>
    req<Product>("/stock/restock", { method: "POST", body: { productId, quantity, note } }),
  openAudit: (note?: string) => req<StockAudit>("/stock/audits", { method: "POST", body: { note } }),
  countAuditItem: (auditId: string, itemId: string, countedQty: number) =>
    req(`/stock/audits/${auditId}/items/${itemId}`, { method: "PATCH", body: { countedQty } }),
  closeAudit: (auditId: string) =>
    req<{ ok: boolean }>(`/stock/audits/${auditId}/close`, { method: "POST" }),

  // sms
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
  settings: () => req<Record<string, unknown>>("/settings"),
  setSetting: (key: string, value: unknown) =>
    req(`/settings/${key}`, { method: "PUT", body: { value } }),
};

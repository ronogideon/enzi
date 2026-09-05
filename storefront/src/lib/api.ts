import type {
  Category, Product, DeliveryMethod, PricedCart, Order,
  Review, BlogPost, Faq, Tier, CustomerAccount,
} from "./types";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
/** Trim trailing slashes and ensure exactly one /api suffix. */
const BASE = (() => {
  let u = RAW_BASE.trim().replace(/\/+$/, "");
  if (!u) return "http://localhost:4000/api";
  if (!/\/api$/i.test(u)) u = `${u}/api`;
  return u;
})();

export const TOKEN_KEY = "enzi.customer.token";

function token(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** Product images are served by the API, so relative paths need the API host. */
export function imageUrl(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return `${BASE.replace(/\/api$/, "")}${url}`;
}

/** Server-side GET with no caching; returns a fallback instead of throwing so
 * a backend hiccup degrades gracefully rather than 500-ing the page. */
async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/** Client-side request that throws, so callers can surface a real message. */
export async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error(
      "Couldn't reach the server. Check your connection and try again."
    );
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

export const api = {
  base: BASE,

  categories: () => get<Category[]>("/categories", []),

  products: (opts: { category?: string; featured?: boolean; search?: string; tier?: Tier } = {}) => {
    const q = new URLSearchParams();
    if (opts.category) q.set("category", opts.category);
    if (opts.featured) q.set("featured", "true");
    if (opts.search) q.set("search", opts.search);
    if (opts.tier) q.set("tier", opts.tier);
    const qs = q.toString();
    return get<Product[]>(`/products${qs ? `?${qs}` : ""}`, []);
  },

  featured: () => get<Product[]>("/products/featured", []),
  product: (slug: string) => get<Product | null>(`/products/${slug}`, null),
  deliveryMethods: () => get<DeliveryMethod[]>("/delivery-methods", []),
  reviews: () => get<Review[]>("/reviews", []),
  blog: () => get<BlogPost[]>("/blog", []),
  blogPost: (slug: string) => get<BlogPost | null>(`/blog/${slug}`, null),
  faqs: () => get<Faq[]>("/faqs", []),
  orderByNumber: (n: string) => get<Order | null>(`/orders/number/${n}`, null),

  // ---- customer accounts ----
  register: (body: {
    name: string; email: string; phone: string; password: string; marketingConsent: boolean;
  }) => post<{ token: string; customer: CustomerAccount }>("/auth/customer/register", body),

  login: (identifier: string, password: string) =>
    post<{ token: string; customer: CustomerAccount }>("/auth/customer/login", {
      identifier,
      password,
    }),

  me: () => request<CustomerAccount>("/auth/customer/me", { auth: true }),

  updateProfile: (body: { name?: string; email?: string; marketingConsent?: boolean }) =>
    request<CustomerAccount>("/auth/customer/me", { method: "PATCH", body, auth: true }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/customer/me/password", {
      method: "POST",
      body: { currentPassword, newPassword },
      auth: true,
    }),

  myOrders: () => request<Order[]>("/auth/customer/me/orders", { auth: true }),

  /** Does this number already have an account? Used to nudge at checkout. */
  checkPhone: (phone: string) =>
    post<{ exists: boolean; hasLogin: boolean; name: string | null }>(
      "/auth/customer/check",
      { phone }
    ),

  // ---- checkout ----
  priceCart: (lines: { productId: string; quantity: number }[], tier: Tier) =>
    post<PricedCart>("/orders/price", { lines, tier }),
  placeOrder: (payload: unknown) =>
    post<{ order: Order; requiresPayment: boolean }>("/orders", payload),
  initiateStk: (orderId: string, phone: string) =>
    post<{ checkoutRequestId: string; customerMessage: string }>("/payments/mpesa/stk", {
      orderId,
      phone,
    }),
  paymentStatus: (checkoutRequestId: string) =>
    fetch(`${BASE}/payments/status/${checkoutRequestId}`).then((r) => r.json()),
  submitReview: (body: { authorName: string; rating: number; body: string }) =>
    post<Review>("/reviews", body),
};

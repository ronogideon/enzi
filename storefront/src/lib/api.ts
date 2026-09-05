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

/**
 * Client-side request that throws, so callers can surface a real message.
 *
 * The error text matters here. A bare "Request failed (404)" is what you get
 * when the response body isn't JSON at all — which means the request never
 * reached this API and something else (a web server, a Next.js 404 page, a
 * proxy) answered instead. That is a configuration problem, not a bug in the
 * form, so the message says so and names the URL it actually called.
 */
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

  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Couldn't reach the server at ${BASE}. Check your connection and try again.`,
      { url, kind: "network" }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let payload: { error?: string } | null = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (payload?.error) throw new ApiError(payload.error, { url, kind: "api", status: res.status });

    // Non-JSON body => we're not talking to the API.
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(text);
    if (res.status === 404 && looksLikeHtml)
      throw new ApiError(
        `The shop is pointed at the wrong address for its server, so signing up can't work yet. ` +
          `It tried ${url} and got a web page instead of the API.`,
        { url, kind: "misconfigured", status: 404 }
      );

    throw new ApiError(`Request failed (${res.status}) at ${url}`, {
      url,
      kind: "api",
      status: res.status,
    });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Carries enough context for a page to explain what actually went wrong. */
export class ApiError extends Error {
  url: string;
  status?: number;
  kind: "network" | "api" | "misconfigured";
  constructor(
    message: string,
    meta: { url: string; status?: number; kind: "network" | "api" | "misconfigured" }
  ) {
    super(message);
    this.name = "ApiError";
    this.url = meta.url;
    this.status = meta.status;
    this.kind = meta.kind;
  }
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

export const api = {
  base: BASE,

  /** Is the API reachable at the configured address? Used by the sign-up page. */
  async health(): Promise<{ ok: boolean; url: string; error?: string }> {
    const url = `${BASE}/health`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return { ok: false, url, error: `The server answered ${res.status}.` };
      const body = await res.json().catch(() => null);
      if (!body?.ok) return { ok: false, url, error: "That address isn't the shop's API." };
      return { ok: true, url };
    } catch {
      return { ok: false, url, error: "No response from the server." };
    }
  },

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

  /** Is this email free? Lets the sign-up form flag a clash before submitting. */
  checkEmail: (email: string) =>
    post<{ taken: boolean }>("/auth/customer/check-email", { email }),

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

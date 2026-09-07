import type {
  Category, Product, DeliveryMethod, PricedCart, Order,
  Review, BlogPost, Faq, Tier, CustomerAccount,
} from "./types";
import { serverEnv, normalizeApiUrl, type RuntimeEnv } from "./runtime-env";

export interface SiteConfig {
  store: { name: string; phone: string; email: string; address: string };
  socials: Partial<
    Record<"instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "youtube" | "whatsapp", string>
  >;
  analytics: { gaId: string; metaPixelId: string };
  seo: { siteUrl: string; defaultDescription: string };
}

declare global {
  interface Window { __ENV__?: Partial<RuntimeEnv>; }
}

/**
 * The API base is resolved per call, not frozen at module load:
 *
 *   - On the server it comes from process.env at request time, so a Railway
 *     variable change takes effect on restart with no rebuild.
 *   - In the browser it comes from window.__ENV__, injected by the root layout.
 *
 * Nothing is compiled into the bundle any more, which is what made a wrong
 * NEXT_PUBLIC_API_URL impossible to correct without a full redeploy.
 */
export function apiBase(): string {
  if (typeof window === "undefined") return serverEnv().API_URL;
  const injected = window.__ENV__?.API_URL;
  if (injected) return injected;
  // The layout always injects this. Reaching here means the script didn't run,
  // so fall back to same-origin rather than to a hardcoded host.
  return normalizeApiUrl(window.location.origin);
}

export const TOKEN_KEY = "enzi.customer.token";

function token(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/**
 * True when the configured API address is the storefront's own origin. That
 * can never be right: the Next.js app has no /api routes, so every call comes
 * back as an HTML 404 page. Worth naming explicitly because the resulting
 * "Request failed (404)" gives no hint about the actual cause.
 */
export function isSelfPointing(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(apiBase()).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Product images are served by the API, so relative paths need the API host. */
export function imageUrl(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return `${apiBase().replace(/\/api$/, "")}${url}`;
}

/** Server-side GET with no caching; returns a fallback instead of throwing so
 * a backend hiccup degrades gracefully rather than 500-ing the page. */
async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiBase()}${path}`, { cache: "no-store" });
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

  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Couldn't reach the server at ${apiBase()}. Check your connection and try again.`,
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
    if (res.status === 404 && looksLikeHtml) {
      const detail = isSelfPointing()
        ? `It called ${url}, which is this website's own address — not the shop's server. ` +
          `Those need to be two separate addresses.`
        : `It called ${url} and got a web page back instead of the shop's server.`;
      throw new ApiError(
        `The shop is pointed at the wrong address for its server, so this can't work yet. ${detail}`,
        { url, kind: "misconfigured", status: 404 }
      );
    }

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
  get base() {
    return apiBase();
  },

  /**
   * Public site config — socials, analytics IDs, SEO defaults. Fetched on the
   * server so it can feed metadata and the sitemap; falls back to sane empties
   * if the API is unreachable, so a backend blip never blanks the site.
   */
  siteConfig: () =>
    get<SiteConfig>("/settings/public", {
      store: { name: "Enzi Packaging", phone: "", email: "", address: "" },
      socials: {},
      analytics: { gaId: "", metaPixelId: "" },
      seo: { siteUrl: "https://enzipackaging.com", defaultDescription: "" },
    }),

  receiptUrl: (orderNumber: string) =>
    `${apiBase()}/orders/number/${orderNumber}/receipt`,

  /** Is the API reachable at the configured address? Used by the sign-up page. */
  async health(): Promise<{ ok: boolean; url: string; error?: string; selfPointing?: boolean }> {
    const url = `${apiBase()}/health`;

    // The most common misconfiguration by far: NEXT_PUBLIC_API_URL left unset
    // or set to the storefront's own address, so /api/... hits Next.js and
    // gets an HTML 404 back. Detect it by name rather than making someone
    // infer it from a generic error.
    if (isSelfPointing()) {
      return {
        ok: false,
        url,
        selfPointing: true,
        error:
          "The shop is configured to use its own web address as its API address. " +
          "Those have to be two different services.",
      };
    }

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

  myOrders: () =>
    request<
      (Order & {
        canPay?: boolean;
        lastPaymentStatus?: string | null;
        lastPaymentMessage?: string | null;
      })[]
    >("/auth/customer/me/orders", { auth: true }),

  retryOrderPayment: (orderNumber: string) =>
    request<{ provider: string; checkoutRequestId: string; customerMessage: string }>(
      `/auth/customer/me/orders/${orderNumber}/pay`,
      { method: "POST", auth: true }
    ),

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
  // No tier argument: the server derives retail vs wholesale per line from the
  // quantity, so the client can't ask for a price it hasn't earned.
  priceCart: (lines: { productId: string; variantId?: string; quantity: number }[]) =>
    post<PricedCart>("/orders/price", { lines }),
  placeOrder: (payload: unknown) =>
    post<{
      order: Order;
      requiresPayment: boolean;
      alreadyExisted?: boolean;
      alreadyPaid?: boolean;
    }>("/orders", payload),
  /** Gateway-agnostic: the server picks M-Pesa or Kopo Kopo from settings. */
  initiateStk: (orderId: string, phone: string) =>
    post<{ provider: string; checkoutRequestId: string; customerMessage: string }>(
      "/payments/stk",
      { orderId, phone }
    ),
  paymentStatus: (
    reference: string
  ): Promise<{
    status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
    outcome:
      | "pending"
      | "success"
      | "cancelled"
      | "timeout"
      | "wrong_pin"
      | "insufficient"
      | "failed";
    isPaid: boolean;
    orderNumber: string;
    receipt: string | null;
    message: string | null;
    stalePending?: boolean;
  }> => fetch(`${apiBase()}/payments/status/${reference}`).then((r) => r.json()),
  submitReview: (body: { authorName: string; rating: number; body: string }) =>
    post<Review>("/reviews", body),
};

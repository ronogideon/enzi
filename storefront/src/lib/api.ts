import type {
  Category,
  Product,
  DeliveryMethod,
  PricedCart,
  Order,
  Review,
  BlogPost,
  Faq,
  Tier,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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

/** Client-side mutating POST; throws so callers can surface errors. */
export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(msg.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
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

  // client-side flows
  priceCart: (lines: { productId: string; quantity: number }[], tier: Tier) =>
    post<PricedCart>("/orders/price", { lines, tier }),
  placeOrder: (payload: unknown) =>
    post<{ order: Order; requiresPayment: boolean }>("/orders", payload),
  initiateStk: (orderId: string, phone: string) =>
    post<{ checkoutRequestId: string; customerMessage: string }>(
      "/payments/mpesa/stk",
      { orderId, phone }
    ),
  paymentStatus: (checkoutRequestId: string) =>
    fetch(`${BASE}/payments/status/${checkoutRequestId}`).then((r) => r.json()),
  submitReview: (body: { authorName: string; rating: number; body: string }) =>
    post<Review>("/reviews", body),
};

export type Tier = "RETAIL" | "WHOLESALE";

export interface Category {
  id: string;
  name: string;
  slug: string;
  position: number;
  _count?: { products: number };
}
export interface ProductImage {
  id: string;
  url: string;
  alt?: string | null;
}
export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  categoryId?: string | null;
  category?: Category | null;
  retailPrice: number;
  wholesalePrice?: number | null;
  retailMinQty: number;
  wholesaleMinQty: number;
  stockQty: number;
  featured: boolean;
  images: ProductImage[];
  effectivePrice?: number;
  effectiveWholesalePrice?: number | null;
}
export interface DeliveryMethod {
  id: string;
  name: string;
  type: "STORE_PICKUP" | "DELIVERY" | "PARCEL" | "PICKUP_MTAANI";
  description?: string | null;
  baseCost: number;
  podAllowed: boolean;
}
export interface PricedLine {
  productId: string;
  name: string;
  requestedQty: number;
  quantity: number;
  bumped: boolean;
  unitPrice: number;
  lineTotal: number;
  tier: Tier;
  wholesaleMinQty: number | null;
  retailUnitPrice: number;
  wholesaleSaving: number;
}
export interface PricedCart {
  wholesaleSaving: number;
  tier: Tier;
  lines: PricedLine[];
  subtotal: number;
}
export interface OrderItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}
export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  tier: Tier;
  subtotal: number;
  deliveryFee: number;
  total: number;
  isPaid: boolean;
  isPayOnDelivery: boolean;
  createdAt: string;
  paidAt?: string | null;
  packedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  trackingRef?: string | null;
  items: OrderItem[];
  deliveryMethod?: DeliveryMethod | null;
}
export interface Review {
  id: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
}
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  coverImage?: string | null;
  publishedAt?: string | null;
}
export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface CustomerAccount {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  marketingConsent: boolean;
  orderCount: number;
  totalSpent: number;
  createdAt: string;
}

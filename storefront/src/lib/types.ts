export type Tier = "RETAIL" | "WHOLESALE";

export interface Category {
  id: string;
  name: string;
  slug: string;
  position: number;
  _count?: { products: number };
}
export interface ProductImage {
  variantId?: string | null;
  id: string;
  url: string;
  alt?: string | null;
}
export interface ProductVariant {
  id: string;
  colour?: string | null;
  size?: string | null;
  colourHex?: string | null;
  swatchMediaId?: string | null;
  slug?: string | null;
  retailPrice: number;
  wholesalePrice?: number | null;
  position?: number;
  /** The API never exposes exact stock — only whether it can be bought. */
  inStock: boolean;
}

/** A sibling colour listing within the same product group. */
export interface ColourOption {
  id: string;
  slug: string;
  colourName?: string | null;
  colourHex?: string | null;
  swatchMediaId?: string | null;
  groupPosition?: number;
  images: ProductImage[];
  variants: ProductVariant[];
  inStock: boolean;
}

export interface Product {
  hasVariants?: boolean;
  groupId?: string | null;
  colourName?: string | null;
  colourOptions?: ColourOption[];
  variants?: ProductVariant[];
  inStock?: boolean;
  badgeText?: string | null;
  badgeActive?: boolean;
  createdAt?: string;
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
export interface DeliveryZone {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  freeAbove?: number | null;
  active?: boolean;
  position?: number;
}

export interface DeliveryMethod {
  active?: boolean;
  id: string;
  name: string;
  type: "STORE_PICKUP" | "DELIVERY" | "PARCEL" | "PICKUP_MTAANI";
  description?: string | null;
  baseCost: number;
  podAllowed: boolean;
  zones?: DeliveryZone[];
}
export interface PricedLine {
  productId: string;
  unitsToWholesale?: number;
  variantId?: string | null;
  variantLabel?: string | null;
  groupQty?: number;
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

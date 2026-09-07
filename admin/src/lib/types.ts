export type Role = "SUPERADMIN" | "ADMIN" | "STAFF" | "SUPPORT";
export type Tier = "RETAIL" | "WHOLESALE";

export interface Staff {
  id: string;
  name: string;
  email?: string;
  role: Role;
  mustChangePassword?: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  _count?: { packedOrders: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  active?: boolean;
  position?: number;
  _count?: { products: number };
}

export interface DeliveryZone {
  id: string;
  methodId: string;
  name: string;
  description?: string | null;
  price: number;
  freeAbove?: number | null;
  active: boolean;
  position: number;
}

export interface ProductImage {
  id?: string;
  url: string;
  alt?: string | null;
  mediaId?: string | null;
  position?: number;
}

export interface UploadedImage {
  id: string; url: string; filename: string; mimeType: string; size: number;
}

export interface ProductVariant {
  id: string;
  productId?: string;
  colour?: string | null;
  size?: string | null;
  colourHex?: string | null;
  swatchMediaId?: string | null;
  sku?: string | null;
  slug?: string | null;
  retailPrice: number;
  wholesalePrice?: number | null;
  stockQty: number;
  active: boolean;
  position: number;
}

export interface Product {
  hasVariants?: boolean;
  groupId?: string | null;
  colourName?: string | null;
  colourHex?: string | null;
  swatchMediaId?: string | null;
  groupPosition?: number;
  variants?: ProductVariant[];
  badgeText?: string | null;
  badgeActive?: boolean;
  id: string; name: string; slug: string; description?: string | null;
  sku?: string | null;
  categoryId?: string | null; category?: Category | null;
  retailPrice: number; wholesalePrice?: number | null;
  retailMinQty: number; wholesaleMinQty: number;
  stockQty: number; featured: boolean; active: boolean;
  images: ProductImage[];
  createdAt?: string;
  _count?: { orderItems: number };
}

export interface Promotion {
  id: string; name: string; type: "PERCENT" | "FIXED_PRICE" | "FIXED_DISCOUNT";
  value: number; tier?: Tier | null; productId?: string | null;
  categoryId?: string | null; startsAt?: string | null; endsAt?: string | null;
  active: boolean; createdAt: string;
}

export interface DeliveryMethod {
  id: string; name: string;
  type: "STORE_PICKUP" | "DELIVERY" | "PARCEL" | "PICKUP_MTAANI";
  description?: string | null; baseCost: number; podAllowed: boolean;
  active: boolean; position: number;
  zones?: DeliveryZone[];
  _count?: { orders: number };
}

export interface OrderItem {
  id: string; name: string; unitPrice: number; quantity: number; lineTotal: number;
}

export interface OrderEvent {
  id: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt: string;
  staff?: { id: string; name: string } | null;
}

export type OrderStatus =
  | "DRAFT" | "PENDING_PAYMENT" | "CONFIRMED" | "PROCESSING" | "PACKED"
  | "DISPATCHED" | "DELIVERED" | "CANCELLED" | "REFUNDED";

export interface Order {
  id: string; orderNumber: string; status: OrderStatus; tier: Tier;
  subtotal: number; deliveryFee: number; total: number;
  isPaid: boolean; isPayOnDelivery: boolean; createdAt: string;
  paidAt?: string | null;
  packedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  trackingRef?: string | null;
  staffNotes?: string | null;
  deliveryDetails?: { note?: string } | null;
  customer?: {
    id: string; name?: string | null; phone: string; email?: string | null;
  } | null;
  deliveryMethod?: { name: string; type?: string } | null;
  deliveryZone?: { id: string; name: string } | null;
  packedBy?: { id: string; name: string } | null;
  items: OrderItem[];
  events?: OrderEvent[];
  nextStatuses?: OrderStatus[];
}

export interface Customer {
  id: string; phone: string; name?: string | null; email?: string | null;
  tags: string[]; notes?: string | null; marketingConsent: boolean;
  orderCount: number; totalSpent: number;
  lastOrderAt?: string | null; lastLoginAt?: string | null; createdAt: string;
  hasAccount?: boolean;
  orders?: Order[]; addresses?: unknown[];
}

export interface StockAuditItem {
  id: string; productId: string; systemQty: number; countedQty: number;
  variance: number; applied: boolean; product?: { name: string };
}

export interface StockAudit {
  id: string; reference: string; closedAt?: string | null; createdAt: string;
  items: StockAuditItem[];
}

export interface SmsCampaign {
  id: string; name: string; body: string; status: string;
  recipients: number; sentAt?: string | null; createdAt: string;
}

export interface StatsOverview {
  revenueTotal: number; revenueThisMonth: number; revenueLastMonth: number;
  revenueToday: number; revenueChangePct: number | null;
  orders: number; ordersToday: number; openOrders: number;
  packingQueue: number; awaitingDispatch: number; inTransit: number;
  customers: number; newCustomersThisMonth: number; accountHolders: number;
  byStatus: Record<string, number>;
  lowStock: { id: string; name: string; stockQty: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[];
}

export interface SettingEntry {
  value: string;
  secret: boolean;
  isSet: boolean;
  source: "database" | "environment" | "unset";
}
export type SettingsMap = Record<string, SettingEntry>;

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  coverImage?: string | null;
  published: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  position: number;
  active: boolean;
  createdAt: string;
}

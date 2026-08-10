export type Role = "SUPERADMIN" | "ADMIN" | "STAFF" | "SUPPORT";
export type Tier = "RETAIL" | "WHOLESALE";

export interface Staff { id: string; name: string; role: Role; }
export interface Category { id: string; name: string; slug: string; _count?: { products: number }; }
export interface Product {
  id: string; name: string; slug: string; description?: string | null;
  categoryId?: string | null; category?: Category | null;
  retailPrice: number; wholesalePrice?: number | null;
  retailMinQty: number; wholesaleMinQty: number;
  stockQty: number; featured: boolean; active: boolean;
  images: { id: string; url: string }[];
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
}
export interface OrderItem { id: string; name: string; unitPrice: number; quantity: number; lineTotal: number; }
export interface Order {
  id: string; orderNumber: string; status: string; tier: Tier;
  subtotal: number; deliveryFee: number; total: number;
  isPaid: boolean; isPayOnDelivery: boolean; createdAt: string;
  customer?: { id: string; name?: string | null; phone: string } | null;
  deliveryMethod?: { name: string } | null;
  items: OrderItem[];
}
export interface Customer {
  id: string; phone: string; name?: string | null; email?: string | null;
  tags: string[]; notes?: string | null; marketingConsent: boolean;
  orderCount: number; totalSpent: number; lastOrderAt?: string | null;
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
  revenueTotal: number; revenueThisMonth: number; orders: number;
  openOrders: number; customers: number;
  lowStock: { id: string; name: string; stockQty: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[];
}

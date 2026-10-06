import { prisma } from "../../lib/prisma";
import { background, sendEmail } from "./email.service";
import { EMAIL_ON_STATUS } from "./order-status";
import { orderConfirmationEmail, orderUpdateEmail, type OrderEmailData } from "./templates/order";
import { staffNewOrderEmail } from "./templates/staff";
import { env } from "../../config/env";
import { pushToStaff } from "../push/push.service";
import { kes } from "./templates/layout";

/** Roles that can open the Orders page — the people who act on a new order. */
const ORDER_ROLES = ["SUPERADMIN", "ADMIN", "STAFF"] as const;

export async function loadOrderForEmail(orderId: string): Promise<OrderEmailData | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { name: true, email: true, phone: true } },
      deliveryMethod: { select: { name: true } },
      deliveryZone: { select: { name: true } },
    },
  });
  if (!o) return null;

  const details = (o.deliveryDetails ?? {}) as { note?: string; instructions?: string };
  const deliveryLabel = [o.deliveryMethod?.name, o.deliveryZone?.name].filter(Boolean).join(" — ") || null;

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer?.name ?? null,
    email: o.customer?.email?.trim() || null,
    status: o.status,
    isPaid: o.isPaid,
    isPayOnDelivery: o.isPayOnDelivery,
    items: o.items.map((it) => ({
      name: it.name,
      variantLabel: it.variantLabel,
      quantity: it.quantity,
      lineTotal: it.lineTotal,
    })),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    discount: o.discount,
    total: o.total,
    deliveryLabel,
    deliveryNote: typeof details.note === "string" ? details.note : null,
    trackingRef: o.trackingRef,
  };
}

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const o = await loadOrderForEmail(orderId);
  if (!o?.email) return; // email is optional at checkout — phone is the identity
  await sendEmail({
    to: o.email,
    ...orderConfirmationEmail(o),
    tag: "order_confirmation",
    idempotencyKey: `order-confirmation/${o.id}`,
  });
}

export async function sendOrderStatusEmail(orderId: string, status: string): Promise<void> {
  if (!EMAIL_ON_STATUS.has(status)) return;
  const o = await loadOrderForEmail(orderId);
  if (!o?.email) return;
  await sendEmail({
    to: o.email,
    ...orderUpdateEmail(o, status),
    tag: `order_${status.toLowerCase()}`,
    idempotencyKey: `order-status/${o.id}/${status}`,
  });
}

/**
 * Tell staff a new order needs packing. One email per person (not a shared
 * To: line) so nobody sees everyone else's address and one bad address can't
 * sink the rest.
 */
export async function sendStaffNewOrderAlert(orderId: string): Promise<void> {
  const [o, customer, staff] = await Promise.all([
    loadOrderForEmail(orderId),
    prisma.order.findUnique({ where: { id: orderId }, select: { customer: { select: { phone: true } } } }),
    prisma.staffUser.findMany({
      where: { active: true, role: { in: [...ORDER_ROLES] } },
      select: { email: true },
    }),
  ]);
  if (!o || staff.length === 0) return;

  const mail = staffNewOrderEmail({ ...o, customerPhone: customer?.customer?.phone ?? null });
  await Promise.all(
    staff.map((s) =>
      sendEmail({
        to: s.email,
        from: env.email.fromOrders,
        ...mail,
        tag: "staff_new_order",
        idempotencyKey: `staff-new-order/${o.id}/${s.email}`,
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Hooks, called from orders.service. All fire-and-forget.

/** A POD order was placed, or a pay-first order's payment landed. */
export function onOrderConfirmed(orderId: string): void {
  background(`confirmation ${orderId}`, () => sendOrderConfirmation(orderId));
  // Staff hear about it at the same moment: once it's actually worth packing.
  background(`staff alert ${orderId}`, () => sendStaffNewOrderAlert(orderId));
  background(`staff push ${orderId}`, () => pushNewOrder(orderId));
}

/** Phone notification on every device where staff turned order alerts on. */
async function pushNewOrder(orderId: string): Promise<void> {
  const o = await loadOrderForEmail(orderId);
  if (!o) return;
  const pay = o.isPaid ? "Paid" : o.isPayOnDelivery ? "Pay on delivery" : "Awaiting payment";
  const items = o.items.reduce((n, i) => n + i.quantity, 0);
  await pushToStaff(
    { roles: [...ORDER_ROLES] },
    {
      title: `New order · ${kes(o.total)}`,
      body: `${o.orderNumber} · ${o.customerName ?? "Guest"} · ${items} item${items === 1 ? "" : "s"} · ${pay}`,
      url: `/orders?order=${encodeURIComponent(o.id)}`,
      tag: `order-${o.id}`,
    }
  );
}

/**
 * Any status change after confirmation. An order that never got past
 * PENDING_PAYMENT never had a confirmation email, so telling the customer it
 * was cancelled would be the first they hear of it — skip that case.
 */
export function onOrderStatusChanged(orderId: string, from: string, to: string): void {
  if (from === to) return;
  if (from === "PENDING_PAYMENT" || from === "DRAFT") return;
  background(`status ${orderId} ${to}`, () => sendOrderStatusEmail(orderId, to));
}

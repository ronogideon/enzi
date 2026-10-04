import { prisma } from "../../lib/prisma";
import { background, sendEmail } from "./email.service";
import { EMAIL_ON_STATUS } from "./order-status";
import { orderConfirmationEmail, orderUpdateEmail, type OrderEmailData } from "./templates/order";

export async function loadOrderForEmail(orderId: string): Promise<OrderEmailData | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { name: true, email: true } },
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

// ---------------------------------------------------------------------------
// Hooks, called from orders.service. All fire-and-forget.

/** A POD order was placed, or a pay-first order's payment landed. */
export function onOrderConfirmed(orderId: string): void {
  background(`confirmation ${orderId}`, () => sendOrderConfirmation(orderId));
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

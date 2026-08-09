import { PricingTier, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/error";
import { normalizePhone, isValidKePhone } from "../../lib/phone";
import { priceCart, CartLineInput } from "../cart/cart.service";

export interface PlaceOrderInput {
  phone: string;
  name?: string;
  email?: string;
  tier?: PricingTier;
  lines: CartLineInput[];
  deliveryMethodId: string;
  deliveryDetails?: Prisma.InputJsonValue;
}

export interface PlaceOrderResult {
  order: Awaited<ReturnType<typeof loadOrder>>;
  requiresPayment: boolean; // true => caller must trigger STK before it's CONFIRMED
}

/** ENZ-2026-000123 style, sequential per year. */
async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${env.store.orderPrefix}-${year}-`;
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const seq = last ? parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(seq).padStart(6, "0");
}

export function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: true,
      customer: true,
      deliveryMethod: true,
    },
  });
}

/**
 * Place an order. The delivery method's `podAllowed` flag decides the path:
 *
 *   podAllowed === true  -> order goes straight to CONFIRMED (pay on delivery).
 *   podAllowed === false -> order is PENDING_PAYMENT; the caller kicks off an
 *                           STK push and the M-Pesa callback flips it to
 *                           CONFIRMED + isPaid once the receipt lands.
 *
 * Stock is deducted at placement for both paths (reservation). A cancelled or
 * failed-payment order should restore stock — see cancelOrder / payment fail.
 */
export async function placeOrder(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const phone = normalizePhone(input.phone);
  if (!isValidKePhone(phone))
    throw new HttpError(400, "Invalid Kenyan phone number");

  const tier = input.tier ?? "RETAIL";
  const method = await prisma.deliveryMethod.findFirst({
    where: { id: input.deliveryMethodId, active: true },
  });
  if (!method) throw new HttpError(400, "Delivery method unavailable");

  // PARCEL and PICKUP_MTAANI can never be pay-on-delivery, regardless of flag.
  const podAllowed =
    method.podAllowed &&
    method.type !== "PARCEL" &&
    method.type !== "PICKUP_MTAANI";

  const cart = await priceCart(input.lines, tier);
  const deliveryFee = method.baseCost;
  const total = cart.subtotal + deliveryFee;

  const order = await prisma.$transaction(async (tx) => {
    // upsert customer by phone (CRM identity)
    const customer = await tx.customer.upsert({
      where: { phone },
      create: { phone, name: input.name, email: input.email },
      update: {
        name: input.name ?? undefined,
        email: input.email ?? undefined,
      },
    });

    const orderNumber = await nextOrderNumber();
    const status: OrderStatus = podAllowed
      ? OrderStatus.CONFIRMED
      : OrderStatus.PENDING_PAYMENT;

    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        tier,
        status,
        subtotal: cart.subtotal,
        deliveryFee,
        total,
        deliveryMethodId: method.id,
        isPayOnDelivery: podAllowed,
        deliveryDetails: input.deliveryDetails,
        placedAt: new Date(),
        items: {
          create: cart.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            tier: l.tier,
          })),
        },
      },
    });

    // deduct + ledger
    for (const l of cart.lines) {
      await tx.product.update({
        where: { id: l.productId },
        data: { stockQty: { decrement: l.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: l.productId,
          delta: -l.quantity,
          reason: "SALE",
          refId: created.id,
        },
      });
    }

    // POD orders count toward CRM immediately; paid orders roll up on callback
    if (podAllowed) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          orderCount: { increment: 1 },
          totalSpent: { increment: total },
          lastOrderAt: new Date(),
        },
      });
    }

    return created;
  });

  return { order: await loadOrder(order.id), requiresPayment: !podAllowed };
}

/** Called by the M-Pesa callback once a receipt is confirmed. */
export async function markOrderPaid(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.isPaid) return order;

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        isPaid: true,
        paidAt: new Date(),
        status: OrderStatus.CONFIRMED,
      },
    });
    await tx.customer.update({
      where: { id: order.customerId },
      data: {
        orderCount: { increment: 1 },
        totalSpent: { increment: order.total },
        lastOrderAt: new Date(),
      },
    });
    return updated;
  });
}

const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  PENDING_PAYMENT: ["CANCELLED"],
};

/** Staff-driven fulfilment transitions, guarded by the allowed graph. */
export async function advanceStatus(orderId: string, to: OrderStatus) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Order not found");
  const allowed = NEXT[order.status as OrderStatus] ?? [];
  if (!allowed.includes(to))
    throw new HttpError(400, `Cannot move ${order.status} -> ${to}`);

  if (to === "CANCELLED") return cancelOrder(orderId);
  return prisma.order.update({ where: { id: orderId }, data: { status: to } });
}

/** Cancel + restore stock. */
export async function cancelOrder(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new HttpError(404, "Order not found");
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          delta: item.quantity,
          reason: "RETURN",
          refId: order.id,
          note: "order cancelled",
        },
      });
    }
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  });
}

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
  customerId?: string; // set when a signed-in customer checks out
}

export interface PlaceOrderResult {
  order: Awaited<ReturnType<typeof loadOrder>>;
  requiresPayment: boolean;
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

const ORDER_INCLUDE = {
  items: true,
  payments: true,
  customer: true,
  deliveryMethod: true,
  packedBy: { select: { id: true, name: true } },
  events: {
    orderBy: { createdAt: "desc" as const },
    include: { staff: { select: { id: true, name: true } } },
  },
};

export function loadOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
}

/**
 * Place an order. The delivery method's `podAllowed` flag decides the path:
 *
 *   podAllowed === true  -> order goes straight to CONFIRMED (pay on delivery).
 *   podAllowed === false -> order is PENDING_PAYMENT; the caller kicks off an
 *                           STK push and the M-Pesa callback flips it to
 *                           CONFIRMED + isPaid once the receipt lands.
 *
 * Every checkout also builds the CRM: the customer row is upserted by phone,
 * so name, email and order history accumulate whether or not they registered.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const phone = normalizePhone(input.phone);
  if (!isValidKePhone(phone)) throw new HttpError(400, "Invalid Kenyan phone number");

  const tier = input.tier ?? "RETAIL";
  const method = await prisma.deliveryMethod.findFirst({
    where: { id: input.deliveryMethodId, active: true },
  });
  if (!method) throw new HttpError(400, "Delivery method unavailable");

  // PARCEL and PICKUP_MTAANI can never be pay-on-delivery, regardless of flag.
  const podAllowed =
    method.podAllowed && method.type !== "PARCEL" && method.type !== "PICKUP_MTAANI";

  const cart = await priceCart(input.lines, tier);
  const deliveryFee = method.baseCost;
  const total = cart.subtotal + deliveryFee;

  // Refuse to sell what isn't there, rather than going negative on stock.
  const shortages: string[] = [];
  for (const line of cart.lines) {
    const p = await prisma.product.findUnique({
      where: { id: line.productId },
      select: { name: true, stockQty: true },
    });
    if (p && p.stockQty < line.quantity)
      shortages.push(`${p.name} (${p.stockQty} left, ${line.quantity} requested)`);
  }
  if (shortages.length)
    throw new HttpError(409, `Not enough stock for: ${shortages.join("; ")}`);

  const order = await prisma.$transaction(async (tx) => {
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
        events: {
          create: {
            toStatus: status,
            note: podAllowed ? "Placed (pay on delivery)" : "Placed, awaiting M-Pesa",
          },
        },
      },
    });

    for (const l of cart.lines) {
      await tx.product.update({
        where: { id: l.productId },
        data: { stockQty: { decrement: l.quantity } },
      });
      await tx.stockMovement.create({
        data: { productId: l.productId, delta: -l.quantity, reason: "SALE", refId: created.id },
      });
    }

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
export async function markOrderPaid(orderId: string, note = "M-Pesa payment confirmed") {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.isPaid) return order;

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { isPaid: true, paidAt: new Date(), status: OrderStatus.CONFIRMED },
    });
    await tx.orderEvent.create({
      data: { orderId, fromStatus: order.status, toStatus: "CONFIRMED", note },
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

/**
 * The fulfilment graph the shop floor walks:
 *   CONFIRMED -> PROCESSING -> PACKED -> DISPATCHED -> DELIVERED
 * PENDING_PAYMENT can be confirmed manually (cash / paybill paid off-platform)
 * or cancelled. Delivered and refunded are terminal.
 */
const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "PACKED", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["DISPATCHED", "DELIVERED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
};

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return NEXT[from] ?? [];
}

/**
 * Staff-driven fulfilment transition. Records who did it and when, so the
 * order page can always show "packed by Jane at 14:20" rather than just a
 * status that someone might have flipped by accident.
 */
export async function advanceStatus(
  orderId: string,
  to: OrderStatus,
  staffId?: string,
  note?: string
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Order not found");

  const allowed = nextStatuses(order.status as OrderStatus);
  if (!allowed.includes(to))
    throw new HttpError(
      400,
      `An order that is ${order.status.toLowerCase().replace("_", " ")} can only move to: ${
        allowed.length ? allowed.join(", ").toLowerCase() : "nothing — this is a final state"
      }`
    );

  if (to === "CANCELLED") return cancelOrder(orderId, staffId, note);
  if (to === "REFUNDED") return refundOrder(orderId, staffId, note);

  // Confirming an unpaid, non-POD order means it was settled off-platform.
  if (order.status === "PENDING_PAYMENT" && to === "CONFIRMED" && !order.isPaid)
    return markOrderPaid(orderId, note ?? "Marked paid manually by staff");

  const data: Prisma.OrderUpdateInput = { status: to };
  if (to === "PACKED") {
    data.packedAt = new Date();
    if (staffId) data.packedBy = { connect: { id: staffId } };
  }
  if (to === "DISPATCHED") data.dispatchedAt = new Date();
  if (to === "DELIVERED") {
    data.deliveredAt = new Date();
    // Cash collected on a POD order settles at handover.
    if (order.isPayOnDelivery && !order.isPaid) {
      data.isPaid = true;
      data.paidAt = new Date();
    }
  }

  const updated = await prisma.order.update({ where: { id: orderId }, data });
  await prisma.orderEvent.create({
    data: { orderId, staffId, fromStatus: order.status, toStatus: to, note },
  });
  return updated;
}

/** Cancel + restore stock. */
export async function cancelOrder(orderId: string, staffId?: string, note?: string) {
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

    // Roll back the CRM totals if this order had already counted.
    if (order.isPaid || order.isPayOnDelivery) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          orderCount: { decrement: 1 },
          totalSpent: { decrement: order.total },
        },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        staffId,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        note: note ?? "Cancelled",
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  });
}

export async function refundOrder(orderId: string, staffId?: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");

    await tx.payment.updateMany({
      where: { orderId, status: "PAID" },
      data: { status: "REFUNDED" },
    });
    await tx.customer.update({
      where: { id: order.customerId },
      data: { totalSpent: { decrement: order.total } },
    });
    await tx.orderEvent.create({
      data: {
        orderId,
        staffId,
        fromStatus: order.status,
        toStatus: "REFUNDED",
        note: note ?? "Refunded",
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.REFUNDED, isPaid: false },
    });
  });
}

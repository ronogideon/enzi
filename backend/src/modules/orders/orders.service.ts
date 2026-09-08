import { PricingTier, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/error";
import { normalizePhone, isValidKePhone } from "../../lib/phone";
import { priceCart, CartLineInput } from "../cart/cart.service";
import { canMarkDelivered, canApproveRefund, audit } from "../../lib/permissions";

export interface PlaceOrderInput {
  phone: string;
  name?: string;
  email?: string;
  tier?: PricingTier;
  lines: CartLineInput[];
  deliveryMethodId: string;
  deliveryZoneId?: string;
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
  deliveryZone: true,
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

  const method = await prisma.deliveryMethod.findFirst({
    where: { id: input.deliveryMethodId, active: true },
    include: { zones: { where: { active: true } } },
  });
  if (!method) throw new HttpError(400, "Delivery method unavailable");

  /**
   * Zone resolution. A method that has zones must be given one — otherwise a
   * customer in Kisumu could check out at the Nairobi CBD rate simply by not
   * choosing an area.
   */
  let zone: (typeof method.zones)[number] | null = null;
  if (method.zones.length > 0) {
    if (!input.deliveryZoneId)
      throw new HttpError(400, `Choose a delivery area for ${method.name}`);
    zone = method.zones.find((z) => z.id === input.deliveryZoneId) ?? null;
    if (!zone) throw new HttpError(400, "That delivery area is no longer available");
  }

  // PARCEL and PICKUP_MTAANI can never be pay-on-delivery, regardless of flag.
  const podAllowed =
    method.podAllowed && method.type !== "PARCEL" && method.type !== "PICKUP_MTAANI";

  // Tier is derived from quantities inside priceCart — the client can't ask
  // for wholesale, it either qualifies or it doesn't.
  const cart = await priceCart(input.lines);
  const tier = cart.tier;

  // The zone price replaces the method's base cost when one applies, and a
  // per-zone free-delivery threshold can waive it entirely.
  let deliveryFee = zone ? zone.price : method.baseCost;
  if (zone?.freeAbove != null && cart.subtotal >= zone.freeAbove) deliveryFee = 0;

  const total = cart.subtotal + deliveryFee;

  // Refuse to sell what isn't there, rather than going negative on stock.
  // Availability is checked against the exact variant where one applies, so a
  // colour that's sold out can't be bought just because another colour has
  // stock. The message deliberately says "not available" rather than quoting a
  // number — stock levels aren't public.
  const shortages: string[] = [];
  for (const line of cart.lines) {
    const label = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name;

    if (line.variantId) {
      const v = await prisma.productVariant.findUnique({
        where: { id: line.variantId },
        select: { stockQty: true, active: true },
      });
      if (!v || !v.active || v.stockQty < line.quantity) shortages.push(label);
    } else {
      const p = await prisma.product.findUnique({
        where: { id: line.productId },
        select: { stockQty: true },
      });
      if (!p || p.stockQty < line.quantity) shortages.push(label);
    }
  }
  if (shortages.length)
    throw new HttpError(
      409,
      `Not enough stock for: ${shortages.join("; ")}. Please adjust the quantities and try again.`
    );

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
        deliveryZoneId: zone?.id ?? null,
        isPayOnDelivery: podAllowed,
        deliveryDetails: input.deliveryDetails,
        placedAt: new Date(),
        items: {
          create: cart.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            name: l.name,
            variantLabel: l.variantLabel,
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
      if (l.variantId) {
        await tx.productVariant.update({
          where: { id: l.variantId },
          data: { stockQty: { decrement: l.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: l.productId },
          data: { stockQty: { decrement: l.quantity } },
        });
      }
      // The movement ledger stays product-level so stock reports still balance;
      // the note carries which variant it was.
      await tx.stockMovement.create({
        data: {
          productId: l.productId,
          delta: -l.quantity,
          reason: "SALE",
          refId: created.id,
          note: l.variantLabel ?? undefined,
        },
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
  DISPATCHED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED", "REFUNDED"],
  RETURNED: ["REFUNDED"],
};

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return NEXT[from] ?? [];
}

/**
 * The same graph, filtered to what this role may actually do.
 *
 * Shop floor takes an order to "out for delivery" and can record a return, but
 * confirming delivery and approving a refund sit with someone else — the person
 * who packed it shouldn't be the one closing it out unwitnessed.
 */
export function nextStatusesForRole(from: OrderStatus, role: string): OrderStatus[] {
  return nextStatuses(from).filter((to) => {
    if (to === "DELIVERED") return canMarkDelivered(role);
    // Refunds are requested, not set directly — see requestRefund/approveRefund.
    if (to === "REFUNDED") return false;
    if (to === "CANCELLED") return role === "SUPERADMIN" || role === "ADMIN";
    return true;
  });
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
  note?: string,
  role?: string
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Order not found");

  if (to === "DELIVERED" && role && !canMarkDelivered(role))
    throw new HttpError(
      403,
      "Only customer care, a manager or the owner can mark an order delivered."
    );

  const allowed = nextStatuses(order.status as OrderStatus);
  if (!allowed.includes(to))
    throw new HttpError(
      400,
      `An order that is ${order.status.toLowerCase().replace("_", " ")} can only move to: ${
        allowed.length ? allowed.join(", ").toLowerCase() : "nothing — this is a final state"
      }`
    );

  if (to === "CANCELLED") return cancelOrder(orderId, staffId, note);
  if (to === "RETURNED") return returnOrder(orderId, staffId, note);
  if (to === "REFUNDED")
    throw new HttpError(
      400,
      "Refunds have to be requested and then approved — use the refund action."
    );

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
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { increment: item.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          delta: item.quantity,
          reason: "RETURN",
          refId: order.id,
          note: item.variantLabel
            ? `order cancelled — ${item.variantLabel}`
            : "order cancelled",
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

/**
 * Record a return and put the goods back on the shelf.
 *
 * Any staff member can do this — returns arrive at whoever is on the floor, and
 * making them wait for a manager just means the stock stays wrong. The money
 * side is separate: a return doesn't refund anything until a refund is approved.
 */
export async function returnOrder(orderId: string, staffId?: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status === "RETURNED") return order;

    for (const item of order.items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { increment: item.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          delta: item.quantity,
          reason: "RETURN",
          refId: order.id,
          note: item.variantLabel
            ? `returned — ${item.variantLabel}`
            : "returned",
        },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        staffId,
        fromStatus: order.status,
        toStatus: "RETURNED",
        note: note ?? "Returned — stock restored",
      },
    });

    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.RETURNED, returnedAt: new Date() },
    });
  });
}

/** Raise a refund request. Approval is a separate, second-person action. */
export async function requestRefund(orderId: string, staffId: string, reason?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status === "REFUNDED") throw new HttpError(400, "This order is already refunded");
  if (order.refundRequestedById && !order.refundApprovedAt)
    throw new HttpError(400, "A refund has already been requested for this order");

  await prisma.orderEvent.create({
    data: {
      orderId,
      staffId,
      note: `Refund requested${reason ? `: ${reason}` : ""}`,
    },
  });

  return prisma.order.update({
    where: { id: orderId },
    data: {
      refundRequestedById: staffId,
      refundRequestedAt: new Date(),
      refundReason: reason ?? null,
      refundApprovedById: null,
      refundApprovedAt: null,
    },
  });
}

/** Approve a pending refund. Enforces who may sign off on whose request. */
export async function approveRefund(
  orderId: string,
  approver: { sub: string; role: string }
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Order not found");
  if (!order.refundRequestedById)
    throw new HttpError(400, "No refund has been requested for this order");
  if (order.refundApprovedAt) throw new HttpError(400, "This refund is already approved");

  const requester = await prisma.staffUser.findUnique({
    where: { id: order.refundRequestedById },
    select: { role: true, id: true, name: true },
  });

  const verdict = canApproveRefund(
    approver.role,
    requester?.role,
    approver.sub,
    order.refundRequestedById
  );
  if (!verdict.ok) throw new HttpError(403, verdict.reason ?? "Not allowed");

  await prisma.order.update({
    where: { id: orderId },
    data: { refundApprovedById: approver.sub, refundApprovedAt: new Date() },
  });

  await audit(approver, {
    action: "order.refund.approve",
    entity: "order",
    entityId: orderId,
    summary: `Approved refund on ${order.orderNumber}${
      requester?.name ? ` (requested by ${requester.name})` : ""
    }`,
  });

  return refundOrder(orderId, approver.sub, "Refund approved");
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

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireStaff } from "../../middleware/auth";
import { HttpError } from "../../middleware/error";
import { priceCart } from "../cart/cart.service";
import {
  placeOrder,
  advanceStatus,
  loadOrder,
  nextStatuses,
  markOrderPaid,
} from "./orders.service";
import { OrderStatus } from "@prisma/client";

export const ordersRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

const lineSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

// ---- public: price a cart (preview, applies min-qty + promos) ----
ordersRouter.post(
  "/price",
  wrap(async (req, res) => {
    const body = z
      .object({
        lines: z.array(lineSchema),
        tier: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
      })
      .parse(req.body);
    res.json(await priceCart(body.lines, body.tier));
  })
);

// ---- public: place order (POD branch handled in service) ----
ordersRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = z
      .object({
        phone: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        tier: z.enum(["RETAIL", "WHOLESALE"]).optional(),
        lines: z.array(lineSchema).min(1),
        deliveryMethodId: z.string(),
        deliveryZoneId: z.string().optional(),
        deliveryDetails: z.any().optional(),
      })
      .parse(req.body);
    const result = await placeOrder(body);
    res.status(201).json(result);
  })
);

// ---- public: look up an order (receipt/invoice) ----
ordersRouter.get(
  "/number/:orderNumber",
  wrap(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { orderNumber: req.params.orderNumber },
      include: { items: true, payments: true, deliveryMethod: true },
    });
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  })
);

// ---- staff: list with filters ----
ordersRouter.get(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const { status, search, unpaid, take } = req.query as Record<string, string>;

    const where: any = {};
    if (status) {
      // "PACKING_QUEUE" is a convenience filter for the shop floor: everything
      // that is paid-or-POD and not yet out the door.
      if (status === "QUEUE") where.status = { in: ["CONFIRMED", "PROCESSING"] };
      else if (status === "OPEN")
        where.status = { in: ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED"] };
      else where.status = status as OrderStatus;
    }
    if (unpaid === "true") where.isPaid = false;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { phone: { contains: search } } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { trackingRef: { contains: search, mode: "insensitive" } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: true,
        deliveryMethod: true,
        deliveryZone: true,
        items: true,
        packedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(take ?? "100", 10) || 100, 300),
    });
    res.json(orders);
  })
);

/** Counts per status — drives the filter chips and the dashboard queue. */
ordersRouter.get(
  "/counts",
  requireStaff,
  wrap(async (_req, res) => {
    const grouped = await prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.status] = g._count._all;
    counts.ALL = Object.values(counts).reduce((a, b) => a + b, 0);
    counts.QUEUE = (counts.CONFIRMED ?? 0) + (counts.PROCESSING ?? 0);
    res.json(counts);
  })
);

ordersRouter.get(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const order = await loadOrder(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");
    res.json({ ...order, nextStatuses: nextStatuses(order.status) });
  })
);

// ---- staff: advance fulfilment status ----
ordersRouter.post(
  "/:id/status",
  requireStaff,
  wrap(async (req, res) => {
    const { to, note } = z
      .object({ to: z.nativeEnum(OrderStatus), note: z.string().max(500).optional() })
      .parse(req.body);
    await advanceStatus(req.params.id, to, req.auth!.sub, note);
    const order = await loadOrder(req.params.id);
    res.json({ ...order!, nextStatuses: nextStatuses(order!.status) });
  })
);

/** Tracking reference + internal notes — used once a parcel is handed over. */
ordersRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const body = z
      .object({
        trackingRef: z.string().max(120).optional().nullable(),
        staffNotes: z.string().max(2000).optional().nullable(),
      })
      .parse(req.body);

    await prisma.order.update({
      where: { id: req.params.id },
      data: {
        trackingRef: body.trackingRef === undefined ? undefined : body.trackingRef || null,
        staffNotes: body.staffNotes === undefined ? undefined : body.staffNotes || null,
      },
    });
    if (body.trackingRef) {
      await prisma.orderEvent.create({
        data: {
          orderId: req.params.id,
          staffId: req.auth!.sub,
          note: `Tracking reference set: ${body.trackingRef}`,
        },
      });
    }
    const order = await loadOrder(req.params.id);
    res.json({ ...order!, nextStatuses: nextStatuses(order!.status) });
  })
);

/**
 * Ask the payment gateway directly whether this order's latest payment went
 * through — the definitive check that doesn't depend on a webhook. Marks the
 * order paid if the gateway says so.
 */
ordersRouter.post(
  "/:id/verify-payment",
  requireStaff,
  wrap(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.isPaid) return res.json({ ok: true, alreadyPaid: true });

    const payment = await prisma.payment.findFirst({
      where: { orderId: order.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (!payment)
      return res.json({ ok: false, message: "No pending payment to check for this order." });

    const { verifyPaymentWithGateway } = await import("../payments/payments.service");
    const result = await verifyPaymentWithGateway(payment.id);
    const fresh = await loadOrder(order.id);
    res.json({ ...result, order: fresh });
  })
);

/** Record an off-platform payment (cash at the counter, direct paybill). */
ordersRouter.post(
  "/:id/mark-paid",
  requireStaff,
  wrap(async (req, res) => {
    const { note } = z.object({ note: z.string().max(300).optional() }).parse(req.body ?? {});
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.isPaid) throw new HttpError(400, "This order is already marked paid");

    await markOrderPaid(order.id, note ?? "Marked paid manually by staff");
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "CASH",
        status: "PAID",
        amount: order.total,
        phone: null,
        resultDesc: note ?? "Recorded manually in the admin dashboard",
      },
    });
    const fresh = await loadOrder(order.id);
    res.json({ ...fresh!, nextStatuses: nextStatuses(fresh!.status) });
  })
);

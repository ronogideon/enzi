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
  nextStatusesForRole,
  markOrderPaid,
  requestRefund,
  approveRefund,
} from "./orders.service";
import { stripMoney, canSeeMoney, audit } from "../../lib/permissions";
import { OrderStatus } from "@prisma/client";

export const ordersRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

const lineSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
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

// ---- public: printable receipt ----
ordersRouter.get(
  "/number/:orderNumber/receipt",
  wrap(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { orderNumber: req.params.orderNumber },
      include: {
        items: true,
        deliveryMethod: true,
        deliveryZone: true,
        customer: { select: { name: true, phone: true, email: true } },
        payments: { where: { status: "PAID" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!order) return res.status(404).send("Order not found");

    const kes = (c: number) =>
      `Ksh ${(c / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"]/g, (m) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string)
      );
    const receipt = order.payments[0]?.receiptRef ?? order.payments[0]?.mpesaReceipt ?? "";

    // Self-contained HTML with a print button. "Download" = print to PDF, which
    // every browser and phone does natively — no PDF library on the server.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(order.orderNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 640px; margin: 0 auto; padding: 32px 24px; color: #111; background: #fff; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.02em; }
  .muted { color: #666; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th, td { text-align: left; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
  td.r, th.r { text-align: right; }
  .tot { font-weight: 700; font-size: 16px; }
  .paid { display: inline-block; margin-top: 4px; padding: 3px 10px; border-radius: 999px;
    background: #e7f6ec; color: #167c3b; font-size: 12px; font-weight: 600; }
  .btn { display: inline-flex; align-items: center; gap: 8px; margin: 8px 0 24px;
    padding: 10px 18px; border-radius: 999px; background: #111; color: #fff;
    border: 0; font-size: 14px; font-weight: 600; cursor: pointer; }
  @media print { .btn { display: none; } body { padding: 0; } }
</style></head><body>
  <button class="btn" onclick="window.print()">Download / Print receipt</button>
  <div class="row">
    <div>
      <h1>ENZI PACKAGING</h1>
      <p class="muted" style="margin:4px 0 0">Receipt</p>
    </div>
    <div style="text-align:right">
      <p style="margin:0"><strong>${esc(order.orderNumber)}</strong></p>
      <p class="muted" style="margin:4px 0 0">${new Date(order.createdAt).toLocaleDateString("en-KE")}</p>
      ${order.isPaid ? '<span class="paid">PAID</span>' : ""}
    </div>
  </div>

  <p class="muted" style="margin:20px 0 0">Billed to</p>
  <p style="margin:2px 0">${esc(order.customer?.name ?? "-")}<br>
    ${esc(order.customer?.phone ? "+" + order.customer.phone : "")}${
      order.customer?.email ? "<br>" + esc(order.customer.email) : ""
    }</p>

  <table>
    <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
    <tbody>
      ${order.items
        .map(
          (it) =>
            `<tr><td>${esc(it.name)}</td><td class="r">${it.quantity}</td><td class="r">${kes(
              it.unitPrice
            )}</td><td class="r">${kes(it.lineTotal)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>

  <div class="row"><span class="muted">Subtotal</span><span>${kes(order.subtotal)}</span></div>
  <div class="row" style="margin-top:6px"><span class="muted">Delivery${
    order.deliveryZone?.name ? " — " + esc(order.deliveryZone.name) : ""
  }</span><span>${order.deliveryFee === 0 ? "Free" : kes(order.deliveryFee)}</span></div>
  <div class="row tot" style="margin-top:12px;border-top:2px solid #111;padding-top:12px">
    <span>Total</span><span>${kes(order.total)}</span></div>

  ${receipt ? `<p class="muted" style="margin-top:20px">M-PESA / Payment ref: ${esc(receipt)}</p>` : ""}
  <p class="muted" style="margin-top:28px;font-size:12px">Thank you for shopping with Enzi Packaging.</p>
</body></html>`);
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

    // Shop floor and support see the last month — enough to pack, chase and
    // answer for recent work, without the whole ledger being on screen.
    const role = req.auth!.role;
    if (!canSeeMoney(role)) {
      const since = new Date();
      since.setMonth(since.getMonth() - 1);
      where.createdAt = { gte: since };
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

    res.json(orders.map((o) => stripMoney(o as any, role)));
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
    const role = req.auth!.role;
    res.json({
      ...stripMoney(order as any, role),
      nextStatuses: nextStatusesForRole(order.status, role),
    });
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
    await advanceStatus(req.params.id, to, req.auth!.sub, note, req.auth!.role);
    const order = await loadOrder(req.params.id);
    await audit(req.auth!, {
      action: `order.${to.toLowerCase()}`,
      entity: "order",
      entityId: req.params.id,
      summary: `Marked ${order!.orderNumber} as ${to.toLowerCase().replace("_", " ")}`,
    });
    res.json({
      ...stripMoney(order as any, req.auth!.role),
      nextStatuses: nextStatusesForRole(order!.status, req.auth!.role),
    });
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

/** Ask for a refund. Approval is a separate action by someone else. */
ordersRouter.post(
  "/:id/refund/request",
  requireStaff,
  wrap(async (req, res) => {
    const { reason } = z
      .object({ reason: z.string().max(300).optional() })
      .parse(req.body ?? {});
    const order = await requestRefund(req.params.id, req.auth!.sub, reason);
    await audit(req.auth!, {
      action: "order.refund.request",
      entity: "order",
      entityId: order.id,
      summary: `Requested a refund on ${order.orderNumber}${reason ? `: ${reason}` : ""}`,
    });
    const fresh = await loadOrder(order.id);
    res.json(stripMoney(fresh as any, req.auth!.role));
  })
);

/** Approve a pending refund. Who may do this depends on who asked. */
ordersRouter.post(
  "/:id/refund/approve",
  requireStaff,
  wrap(async (req, res) => {
    await approveRefund(req.params.id, { sub: req.auth!.sub, role: req.auth!.role });
    const fresh = await loadOrder(req.params.id);
    res.json(stripMoney(fresh as any, req.auth!.role));
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

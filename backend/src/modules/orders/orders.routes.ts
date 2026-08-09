import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireStaff } from "../../middleware/auth";
import { priceCart } from "../cart/cart.service";
import {
  placeOrder,
  advanceStatus,
  loadOrder,
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
        lines: z.array(lineSchema),
        deliveryMethodId: z.string(),
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
    const { status } = req.query as Record<string, string>;
    const orders = await prisma.order.findMany({
      where: status ? { status: status as OrderStatus } : undefined,
      include: { customer: true, deliveryMethod: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(orders);
  })
);

ordersRouter.get(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    res.json(await loadOrder(req.params.id));
  })
);

// ---- staff: advance fulfilment status ----
ordersRouter.post(
  "/:id/status",
  requireStaff,
  wrap(async (req, res) => {
    const { to } = z
      .object({ to: z.nativeEnum(OrderStatus) })
      .parse(req.body);
    res.json(await advanceStatus(req.params.id, to));
  })
);

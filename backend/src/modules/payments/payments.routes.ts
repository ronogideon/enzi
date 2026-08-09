import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { toKes } from "../../lib/money";
import { initiateStkPush, parseStkCallback } from "./mpesa.service";
import { markOrderPaid } from "../orders/orders.service";

export const paymentsRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

// ---- public: kick off STK for a pending order ----
paymentsRouter.post(
  "/mpesa/stk",
  wrap(async (req, res) => {
    const { orderId, phone } = z
      .object({ orderId: z.string(), phone: z.string() })
      .parse(req.body);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.isPaid) throw new HttpError(400, "Order already paid");

    const stk = await initiateStkPush({
      phone,
      amountKes: toKes(order.total),
      accountRef: order.orderNumber,
      description: "Enzi order",
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "MPESA",
        status: "PENDING",
        amount: order.total,
        phone,
        checkoutRequestId: stk.checkoutRequestId,
        merchantRequestId: stk.merchantRequestId,
      },
    });

    res.json({
      checkoutRequestId: stk.checkoutRequestId,
      customerMessage: stk.customerMessage,
    });
  })
);

// ---- Daraja callback (public, Safaricom posts here) ----
paymentsRouter.post(
  "/mpesa/callback",
  wrap(async (req, res) => {
    // Always 200 the callback so Safaricom stops retrying.
    res.json({ ResultCode: 0, ResultDesc: "Received" });

    const parsed = parseStkCallback(req.body);
    if (!parsed.checkoutRequestId) return;

    const payment = await prisma.payment.findUnique({
      where: { checkoutRequestId: parsed.checkoutRequestId },
    });
    if (!payment) return;

    const success = parsed.resultCode === 0;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: success ? "PAID" : "FAILED",
        mpesaReceipt: parsed.mpesaReceipt,
        resultCode: parsed.resultCode,
        resultDesc: parsed.resultDesc,
        rawCallback: req.body,
      },
    });

    if (success) await markOrderPaid(payment.orderId);
  })
);

// ---- poll payment status (storefront waits on STK) ----
paymentsRouter.get(
  "/status/:checkoutRequestId",
  wrap(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { checkoutRequestId: req.params.checkoutRequestId },
      include: { order: true },
    });
    if (!payment) throw new HttpError(404, "Payment not found");
    res.json({
      status: payment.status,
      isPaid: payment.order.isPaid,
      orderNumber: payment.order.orderNumber,
    });
  })
);

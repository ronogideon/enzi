import { Router, raw } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { toKes } from "../../lib/money";
import {
  initiateStkPush,
  parseStkCallback,
  describeMpesaResult,
  queryStkStatus,
} from "./mpesa.service";
import {
  initiateKopokopoStk,
  parseKopokopoWebhook,
  verifyKopokopoSignature,
} from "./kopokopo.service";
import { markOrderPaid } from "../orders/orders.service";
import { activePaymentProvider, kopokopoConfig } from "../settings/settings.service";

export const paymentsRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

/** Which gateway the storefront should expect. Public — no secrets returned. */
paymentsRouter.get(
  "/provider",
  wrap(async (_req, res) => {
    const provider = await activePaymentProvider();
    res.json({
      provider,
      // Both gateways end in the same customer experience: an STK prompt on
      // the phone. The storefront copy shouldn't have to care which is live.
      method: provider === "none" ? null : "M-PESA STK push",
    });
  })
);

/**
 * Start a payment for a pending order.
 *
 * Provider-agnostic: the configured gateway is resolved server-side, so the
 * storefront never has to know or choose. `/mpesa/stk` is kept below as an
 * alias so an older deployed storefront keeps working during a rollout.
 */
async function startPayment(req: any, res: any) {
  const { orderId, phone } = z
    .object({ orderId: z.string(), phone: z.string() })
    .parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.isPaid) throw new HttpError(400, "Order already paid");

  const provider = await activePaymentProvider();
  if (provider === "none")
    throw new HttpError(
      503,
      "No payment gateway is configured. Add M-Pesa or Kopo Kopo credentials in Settings → Payments."
    );

  if (provider === "kopokopo") {
    const [firstName, ...rest] = (order.customer?.name ?? "Customer").trim().split(/\s+/);
    const stk = await initiateKopokopoStk({
      phone,
      amountKes: toKes(order.total),
      reference: order.orderNumber,
      firstName,
      lastName: rest.join(" ") || "-",
      email: order.customer?.email ?? undefined,
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "KOPOKOPO",
        status: "PENDING",
        amount: order.total,
        phone,
        providerRef: stk.paymentRequestId,
      },
    });

    return res.json({
      provider,
      // The storefront polls this value; it is the provider's id either way.
      checkoutRequestId: stk.paymentRequestId,
      customerMessage: stk.customerMessage,
    });
  }

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
      providerRef: stk.checkoutRequestId,
    },
  });

  res.json({
    provider,
    checkoutRequestId: stk.checkoutRequestId,
    customerMessage: stk.customerMessage,
  });
}

paymentsRouter.post("/stk", wrap(startPayment));
paymentsRouter.post("/mpesa/stk", wrap(startPayment)); // legacy alias

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
    if (payment.status === "PAID") return; // duplicate delivery

    const success = parsed.resultCode === 0;
    // Turn the numeric code into something the customer can read and act on.
    const described = describeMpesaResult(parsed.resultCode);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: success ? "PAID" : "FAILED",
        mpesaReceipt: parsed.mpesaReceipt,
        receiptRef: parsed.mpesaReceipt,
        resultCode: parsed.resultCode,
        // Prefer our friendly message; fall back to Safaricom's own text.
        resultDesc: described.message ?? parsed.resultDesc,
        rawCallback: req.body,
      },
    });

    if (success) await markOrderPaid(payment.orderId);
  })
);

/**
 * Kopo Kopo webhook.
 *
 * Mounted with a raw body parser: the HMAC signature is computed over the
 * exact bytes Kopo Kopo sent, and re-serialising a parsed object would change
 * key order or whitespace and break verification. Everything else on this
 * router still uses the normal JSON parser.
 */
paymentsRouter.post(
  "/kopokopo/callback",
  raw({ type: "*/*", limit: "1mb" }),
  wrap(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const cfg = await kopokopoConfig();
    const signature =
      (req.headers["x-kopokopo-signature"] as string | undefined) ??
      (req.headers["x-kopokopo-signature".toLowerCase()] as string | undefined);

    // An unsigned or wrongly-signed payload could otherwise mark any order
    // paid by anyone who learns this URL.
    if (cfg.apiKey && !verifyKopokopoSignature(rawBody, signature, cfg.apiKey)) {
      console.warn("[kopokopo] rejected webhook with an invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
    if (!cfg.apiKey)
      console.warn(
        "[kopokopo] webhook accepted WITHOUT signature verification — set the API key in Settings → Payments."
      );

    // Acknowledge before doing the work so Kopo Kopo stops retrying.
    res.json({ received: true });

    const parsed = parseKopokopoWebhook(body);
    if (!parsed.paymentRequestId) return;

    const payment = await prisma.payment.findFirst({
      where: { providerRef: parsed.paymentRequestId },
    });
    if (!payment) return;
    if (payment.status === "PAID") return; // duplicate delivery

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: parsed.success ? "PAID" : "FAILED",
        receiptRef: parsed.reference ?? null,
        resultDesc: parsed.errorMessage ?? parsed.status ?? null,
        rawCallback: body,
      },
    });

    if (parsed.success) await markOrderPaid(payment.orderId, "Kopo Kopo payment confirmed");
  })
);

// ---- poll payment status (storefront waits on the STK prompt) ----
paymentsRouter.get(
  "/status/:reference",
  wrap(async (req, res) => {
    const ref = req.params.reference;

    // Matches either gateway: Daraja's CheckoutRequestID or Kopo Kopo's
    // payment request id both land in providerRef.
    let payment = await prisma.payment.findFirst({
      where: { OR: [{ providerRef: ref }, { checkoutRequestId: ref }] },
      include: { order: true },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) throw new HttpError(404, "Payment not found");

    /**
     * Safety net: if the payment is still PENDING and it's an M-Pesa request,
     * ask Daraja directly rather than waiting on a callback that may never
     * arrive (e.g. the callback URL is pointed at the wrong host). This is what
     * lets the customer's screen resolve even when the webhook is broken.
     */
    if (
      payment.status === "PENDING" &&
      payment.provider === "MPESA" &&
      payment.checkoutRequestId
    ) {
      const queried = await queryStkStatus(payment.checkoutRequestId);
      if (queried && queried.resultCode !== null) {
        const success = queried.resultCode === 0;
        const described = describeMpesaResult(queried.resultCode);
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: success ? "PAID" : "FAILED",
            resultCode: queried.resultCode,
            resultDesc: described.message ?? queried.resultDesc,
          },
        });
        if (success) await markOrderPaid(payment.orderId);
        payment = (await prisma.payment.findUnique({
          where: { id: payment.id },
          include: { order: true },
        }))!;
      }
    }

    const described =
      payment.provider === "MPESA"
        ? describeMpesaResult(payment.resultCode)
        : { outcome: payment.status === "PAID" ? "success" : payment.status === "FAILED" ? "failed" : "pending", message: payment.resultDesc ?? null };

    res.json({
      status: payment.status,
      // A machine-readable outcome the storefront can branch on, plus the
      // human message. "pending" while we're still waiting.
      outcome: payment.status === "PENDING" ? "pending" : (described as any).outcome,
      provider: payment.provider,
      isPaid: payment.order.isPaid,
      orderNumber: payment.order.orderNumber,
      receipt: payment.receiptRef ?? payment.mpesaReceipt ?? null,
      message: (described as any).message ?? payment.resultDesc ?? null,
    });
  })
);

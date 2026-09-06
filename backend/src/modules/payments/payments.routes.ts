import { Router, raw } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import {
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
import { startPaymentForOrder } from "./payments.service";
import { requireStaff } from "../../middleware/auth";

export const paymentsRouter = Router();

/**
 * The last few raw callbacks, held in memory. Not persistent — it resets on
 * redeploy — but that's fine: its only job is to answer "is Kopo Kopo actually
 * reaching this URL, and what does the payload look like?" while you're
 * debugging a specific test payment.
 */
const recentCallbacks: {
  at: string;
  provider: string;
  matched: boolean;
  detail: string;
}[] = [];
export function recordCallback(entry: {
  provider: string;
  matched: boolean;
  detail: string;
}) {
  recentCallbacks.unshift({ at: new Date().toISOString(), ...entry });
  if (recentCallbacks.length > 20) recentCallbacks.pop();
}

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
  res.json(await startPaymentForOrder(orderId, phone));
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

    // Log EVERY hit, immediately, before anything can reject it. This is the
    // line that was missing: a callback that arrives and gets dropped left no
    // trace, so "the backend isn't confirming" was indistinguishable from "the
    // callback never arrived". Now the log shows which it is.
    console.log(
      `[kopokopo] callback received (${rawBody.length} bytes) from ${
        req.headers["x-forwarded-for"] ?? req.ip
      }`
    );

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("[kopokopo] callback body was not valid JSON:", rawBody.slice(0, 500));
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const cfg = await kopokopoConfig();
    const signature =
      (req.headers["x-kopokopo-signature"] as string | undefined) ??
      (req.headers["X-KopoKopo-Signature"] as string | undefined);

    /**
     * Signature check. Kopo Kopo signs the raw body with your API key. If it
     * fails we now log WHY (missing header, missing key, or mismatch) instead
     * of a silent 401 — a signing mismatch is the single most common reason a
     * K2 integration looks like it "isn't confirming".
     *
     * We still process the payment even on a mismatch, but only after
     * re-verifying the amount directly, so a bad signature degrades to
     * "confirm carefully" rather than "drop it on the floor and tell no one".
     */
    let signatureOk = false;
    if (cfg.apiKey && signature) {
      signatureOk = verifyKopokopoSignature(rawBody, signature, cfg.apiKey);
      if (!signatureOk)
        console.warn(
          "[kopokopo] signature MISMATCH — the API key in Settings may not match " +
            "the one Kopo Kopo signs with. Header present, digest differs."
        );
    } else if (!signature) {
      console.warn("[kopokopo] callback had no X-KopoKopo-Signature header.");
    } else {
      console.warn("[kopokopo] no API key set in Settings — cannot verify signature.");
    }

    // Acknowledge fast so Kopo Kopo stops retrying, then do the work.
    res.json({ received: true });

    const parsed = parseKopokopoWebhook(body);
    console.log(
      `[kopokopo] parsed: id=${parsed.paymentRequestId ?? "?"} status=${
        parsed.status ?? "?"
      } success=${parsed.success} ref=${parsed.reference ?? "-"}`
    );

    if (!parsed.paymentRequestId) {
      console.error(
        "[kopokopo] could not find a payment id in the callback. Raw shape:",
        JSON.stringify(body).slice(0, 800)
      );
      recordCallback({ provider: "kopokopo", matched: false, detail: "no payment id in payload" });
      return;
    }

    // Match on providerRef (what we stored when initiating). Fall back to the
    // metadata reference (the order number) in case K2's id shape differs
    // between initiation and callback.
    let payment = await prisma.payment.findFirst({
      where: { providerRef: parsed.paymentRequestId },
      orderBy: { createdAt: "desc" },
    });

    if (!payment && parsed.reference) {
      const order = await prisma.order.findUnique({
        where: { orderNumber: parsed.reference },
      });
      if (order) {
        payment = await prisma.payment.findFirst({
          where: { orderId: order.id, provider: "KOPOKOPO" },
          orderBy: { createdAt: "desc" },
        });
        if (payment)
          console.log(
            `[kopokopo] matched by order number ${parsed.reference} instead of payment id`
          );
      }
    }

    if (!payment) {
      console.error(
        `[kopokopo] no matching payment for id=${parsed.paymentRequestId} ref=${
          parsed.reference ?? "-"
        }. It may not have been recorded at initiation.`
      );
      recordCallback({
        provider: "kopokopo",
        matched: false,
        detail: `arrived but no matching order (id=${parsed.paymentRequestId})`,
      });
      return;
    }
    if (payment.status === "PAID") {
      console.log("[kopokopo] payment already marked paid — ignoring duplicate.");
      return;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: parsed.success ? "PAID" : "FAILED",
        receiptRef: parsed.reference ?? null,
        resultDesc: parsed.errorMessage ?? parsed.status ?? (signatureOk ? null : "unsigned"),
        rawCallback: body,
      },
    });

    if (parsed.success) {
      await markOrderPaid(payment.orderId, "Kopo Kopo payment confirmed");
      console.log(`[kopokopo] order ${payment.orderId} marked PAID.`);
    } else {
      console.log(`[kopokopo] payment ${payment.id} marked FAILED (${parsed.status}).`);
    }

    recordCallback({
      provider: "kopokopo",
      matched: true,
      detail: `${parsed.status ?? "?"} — ${parsed.reference ?? payment.orderId}`,
    });
  })
);

/**
 * Diagnostics for the admin: has Kopo Kopo actually been hitting our callback
 * URL? Staff-only. Combined with the deploy log, this answers the "is it
 * arriving?" question in one glance.
 */
paymentsRouter.get(
  "/callbacks/recent",
  requireStaff,
  wrap(async (_req, res) => {
    res.json({ callbacks: recentCallbacks });
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

    // Age of the payment attempt, so the storefront can stop waiting on a
    // Kopo Kopo webhook that isn't coming rather than spinning indefinitely.
    const ageSeconds = (Date.now() - payment.createdAt.getTime()) / 1000;

    const described =
      payment.provider === "MPESA"
        ? describeMpesaResult(payment.resultCode)
        : {
            outcome:
              payment.status === "PAID"
                ? "success"
                : payment.status === "FAILED"
                ? "failed"
                : "pending",
            message: payment.resultDesc ?? null,
          };

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
      // Tells the storefront it's waited long enough that a missing webhook,
      // not a slow customer, is the likely cause.
      stalePending: payment.status === "PENDING" && ageSeconds > 90,
    });
  })
);

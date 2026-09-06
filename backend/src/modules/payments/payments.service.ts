import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { toKes } from "../../lib/money";
import { initiateStkPush } from "./mpesa.service";
import { initiateKopokopoStk } from "./kopokopo.service";
import { activePaymentProvider } from "../settings/settings.service";

export interface StartPaymentResult {
  provider: "mpesa" | "kopokopo";
  checkoutRequestId: string;
  customerMessage: string;
}

/**
 * Kick off an STK push for an order through whichever gateway is live, and
 * record the pending Payment row.
 *
 * Extracted so both the checkout flow and "retry payment" from the account
 * page go through one code path — the retry button was the reason this needed
 * to exist outside the checkout route, and duplicating the gateway-selection
 * logic in two places was asking for them to drift apart.
 */
export async function startPaymentForOrder(
  orderId: string,
  phone: string
): Promise<StartPaymentResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.isPaid) throw new HttpError(400, "Order already paid");

  const payPhone = phone || order.customer?.phone || "";
  if (!payPhone) throw new HttpError(400, "No phone number to send the prompt to");

  const provider = await activePaymentProvider();
  if (provider === "none")
    throw new HttpError(
      503,
      "No payment gateway is configured. Add M-Pesa or Kopo Kopo credentials in Settings → Payments."
    );

  if (provider === "kopokopo") {
    const [firstName, ...rest] = (order.customer?.name ?? "Customer").trim().split(/\s+/);
    const stk = await initiateKopokopoStk({
      phone: payPhone,
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
        phone: payPhone,
        providerRef: stk.paymentRequestId,
        statusUrl: stk.statusUrl,
      },
    });

    return {
      provider,
      checkoutRequestId: stk.paymentRequestId,
      customerMessage: stk.customerMessage,
    };
  }

  const stk = await initiateStkPush({
    phone: payPhone,
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
      phone: payPhone,
      checkoutRequestId: stk.checkoutRequestId,
      merchantRequestId: stk.merchantRequestId,
      providerRef: stk.checkoutRequestId,
    },
  });

  return {
    provider,
    checkoutRequestId: stk.checkoutRequestId,
    customerMessage: stk.customerMessage,
  };
}


/**
 * Confirm a pending payment by asking the gateway directly, rather than waiting
 * for its webhook. Returns what the gateway said and marks the order paid on
 * success. This is the "is the gateway actually reporting?" check, on demand.
 */
export async function verifyPaymentWithGateway(paymentId: string): Promise<{
  ok: boolean;
  status?: string;
  message: string;
}> {
  const { queryKopokopoStatus } = await import("./kopokopo.service");
  const { queryStkStatus, describeMpesaResult } = await import("./mpesa.service");
  const { markOrderPaid } = await import("../orders/orders.service");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, message: "Payment not found" };
  if (payment.status === "PAID") return { ok: true, message: "Already paid" };

  if (payment.provider === "KOPOKOPO") {
    if (!payment.statusUrl)
      return { ok: false, message: "No Kopo Kopo status URL recorded for this payment." };
    const q = await queryKopokopoStatus(payment.statusUrl);
    if (!q) return { ok: false, message: "Couldn't reach Kopo Kopo. Try again shortly." };
    if (!q.settled)
      return { ok: false, status: q.status, message: `Still pending at Kopo Kopo (${q.status ?? "?"}).` };

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: q.success ? "PAID" : "FAILED",
        receiptRef: q.reference ?? undefined,
        resultDesc: q.errorMessage ?? q.status ?? null,
      },
    });
    if (q.success) {
      await markOrderPaid(payment.orderId, "Confirmed via Kopo Kopo status check");
      return { ok: true, status: q.status, message: "Payment confirmed and order marked paid." };
    }
    return { ok: false, status: q.status, message: `Kopo Kopo reports this as ${q.status}.` };
  }

  if (payment.provider === "MPESA") {
    if (!payment.checkoutRequestId)
      return { ok: false, message: "No M-Pesa request id recorded for this payment." };
    const q = await queryStkStatus(payment.checkoutRequestId);
    if (!q || q.resultCode === null)
      return { ok: false, message: "Still pending at M-Pesa. Try again shortly." };
    const success = q.resultCode === 0;
    const described = describeMpesaResult(q.resultCode);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: success ? "PAID" : "FAILED", resultCode: q.resultCode, resultDesc: described.message },
    });
    if (success) {
      await markOrderPaid(payment.orderId, "Confirmed via M-Pesa status check");
      return { ok: true, message: "Payment confirmed and order marked paid." };
    }
    return { ok: false, message: described.message };
  }

  return { ok: false, message: "This payment type can't be checked automatically." };
}

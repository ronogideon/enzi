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

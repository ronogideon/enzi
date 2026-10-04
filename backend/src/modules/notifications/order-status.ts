import type { OrderStatus } from "@prisma/client";

/** The customer-facing track. PROCESSING and PACKED both sit on "Packing". */
export const STEP_LABELS = ["Confirmed", "Packing", "On the way", "Delivered"] as const;

export type Tone = "progress" | "done" | "waiting" | "cancelled" | "closed";

export interface StatusMeta {
  /** Index into STEP_LABELS; -1 means the order is off the track. */
  step: number;
  tone: Tone;
  headline: string;
  detail: string;
}

const MAP: Record<OrderStatus, StatusMeta> = {
  DRAFT: { step: -1, tone: "waiting", headline: "Not placed yet", detail: "This order hasn't been placed." },
  PENDING_PAYMENT: {
    step: -1,
    tone: "waiting",
    headline: "Awaiting payment",
    detail: "We'll start on it as soon as payment is confirmed.",
  },
  CONFIRMED: { step: 0, tone: "progress", headline: "Order confirmed", detail: "We've got it and we're getting it ready." },
  PROCESSING: { step: 1, tone: "progress", headline: "Being packed", detail: "Your order is being prepared." },
  PACKED: { step: 1, tone: "progress", headline: "Packed", detail: "Packed and waiting to go out." },
  DISPATCHED: { step: 2, tone: "progress", headline: "On the way", detail: "Your order has left our store." },
  DELIVERED: { step: 3, tone: "done", headline: "Delivered", detail: "Thanks for shopping with us." },
  RETURNED: { step: -1, tone: "closed", headline: "Returned", detail: "This order came back to us." },
  CANCELLED: {
    step: -1,
    tone: "cancelled",
    headline: "Order cancelled",
    detail: "Get in touch if you weren't expecting this.",
  },
  REFUNDED: { step: -1, tone: "closed", headline: "Refunded", detail: "Your payment has been refunded." },
};

export function statusMeta(status: string): StatusMeta {
  return (
    MAP[status as OrderStatus] ?? {
      step: 0,
      tone: "progress",
      headline: status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      detail: "",
    }
  );
}

/**
 * Transitions that also send an email. Everything else only moves the live
 * status in emails the customer already has, which keeps the inbox quiet.
 */
export const EMAIL_ON_STATUS = new Set<string>(["DISPATCHED", "DELIVERED", "CANCELLED", "REFUNDED"]);

export function stepState(meta: StatusMeta, i: number): "done" | "current" | "todo" {
  if (meta.step > i || (meta.tone === "done" && meta.step >= i)) return "done";
  if (meta.step === i) return "current";
  return "todo";
}

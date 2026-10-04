import { env } from "../../../config/env";
import { trackUrl } from "../tracking-links";
import { statusMeta } from "../order-status";
import {
  button, esc, firstName, FONT, h1, kes, layout, lead, liveStatus, small, type RenderedEmail,
} from "./layout";

export interface OrderEmailData {
  id: string;
  orderNumber: string;
  customerName: string | null;
  email: string | null;
  status: string;
  isPaid: boolean;
  isPayOnDelivery: boolean;
  items: { name: string; variantLabel: string | null; quantity: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  /** "Rider delivery — Westlands" */
  deliveryLabel: string | null;
  deliveryNote: string | null;
  trackingRef: string | null;
}

const receiptUrl = (n: string) =>
  `${env.urls.api}/api/orders/number/${encodeURIComponent(n)}/receipt`;

function itemsTable(o: OrderEmailData): string {
  const rows = o.items
    .map(
      (it) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #f0f0f0;${FONT}font-size:14px;color:#111827;">
  ${esc(it.name)}${it.variantLabel ? `<br><span style="color:#6b7280;font-size:13px;">${esc(it.variantLabel)}</span>` : ""}
  <br><span style="color:#6b7280;font-size:13px;">${it.quantity} pcs</span>
</td>
<td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid #f0f0f0;${FONT}font-size:14px;color:#111827;white-space:nowrap;">${kes(it.lineTotal)}</td>
</tr>`
    )
    .join("");

  const line = (label: string, value: string, bold = false) => `<tr>
<td style="padding:4px 0;${FONT}font-size:14px;color:${bold ? "#111827" : "#4b5563"};${bold ? "font-weight:700;" : ""}">${label}</td>
<td align="right" style="padding:4px 0;${FONT}font-size:14px;color:#111827;${bold ? "font-weight:700;" : ""}white-space:nowrap;">${value}</td>
</tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
${rows}
<tr><td colspan="2" style="height:8px;"></td></tr>
${line("Subtotal", kes(o.subtotal))}
${o.discount > 0 ? line("Discount", `−${kes(o.discount)}`) : ""}
${line("Delivery", o.deliveryFee > 0 ? kes(o.deliveryFee) : "Free")}
${line("Total", kes(o.total), true)}
</table>`;
}

function paymentLine(o: OrderEmailData): string {
  if (o.isPaid) return "Paid";
  if (o.isPayOnDelivery) return `Pay on delivery — ${kes(o.total)} due when it arrives`;
  return "Awaiting payment";
}

const textItems = (o: OrderEmailData) =>
  o.items
    .map((i) => `- ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} × ${i.quantity}  ${kes(i.lineTotal)}`)
    .join("\n");

export function orderConfirmationEmail(o: OrderEmailData): RenderedEmail {
  const url = trackUrl(o.id);
  const delivery = [o.deliveryLabel, o.deliveryNote].filter(Boolean).map((s) => esc(s)).join("<br>");

  const html = layout({
    preheader: `${o.orderNumber} · ${kes(o.total)} — the status in this email updates as your order moves.`,
    body: `${h1(`Thanks, ${esc(firstName(o.customerName))}!`)}
${lead(
  `We've got order <strong style="color:#111827;">${esc(o.orderNumber)}</strong>. The status below stays current — open this email any time to check on it.`
)}
${liveStatus(o.id)}
${itemsTable(o)}
<p style="margin:20px 0 0;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Payment</strong><br>${esc(paymentLine(o))}</p>
${delivery ? `<p style="margin:16px 0 0;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Delivery</strong><br>${delivery}</p>` : ""}
${button(url, "Track your order")}
${small(`<a href="${esc(receiptUrl(o.orderNumber))}" style="color:#6b7280;">Download receipt</a> · Questions? Just reply to this email.`)}`,
  });

  const text = `Thanks, ${firstName(o.customerName)}!

We've got order ${o.orderNumber}.

${textItems(o)}

Total: ${kes(o.total)}
Payment: ${paymentLine(o)}
${o.deliveryLabel ? `Delivery: ${o.deliveryLabel}\n` : ""}
Track your order: ${url}
Receipt: ${receiptUrl(o.orderNumber)}

Questions? Reply to this email.`;

  return { subject: `Order ${o.orderNumber} confirmed`, html, text };
}

const UPDATE_COPY: Record<string, { subject: (n: string) => string; intro: (o: OrderEmailData) => string }> = {
  DISPATCHED: {
    subject: (n) => `Order ${n} is on its way`,
    intro: (o) =>
      `Good news — your order has been dispatched.${o.trackingRef ? ` Your reference is ${o.trackingRef}.` : ""}${
        o.isPayOnDelivery && !o.isPaid ? ` Please have ${kes(o.total)} ready when it arrives.` : ""
      }`,
  },
  DELIVERED: {
    subject: (n) => `Order ${n} delivered`,
    intro: () => "Your order has been delivered. We hope it's exactly what you needed.",
  },
  CANCELLED: {
    subject: (n) => `Order ${n} cancelled`,
    intro: () => "Your order has been cancelled. If you weren't expecting this, reply to this email and we'll sort it out.",
  },
  REFUNDED: {
    subject: (n) => `Order ${n} refunded`,
    intro: () => "We've refunded your payment for this order. It can take a short while to reflect on your M-Pesa.",
  },
};

export function orderUpdateEmail(o: OrderEmailData, status: string): RenderedEmail {
  const meta = statusMeta(status);
  const copy = UPDATE_COPY[status] ?? { subject: (n: string) => `Order ${n}: ${meta.headline}`, intro: () => meta.detail };
  const intro = copy.intro(o);
  const url = trackUrl(o.id);

  const html = layout({
    preheader: intro,
    body: `${h1(esc(meta.headline))}
${lead(`${esc(intro)} <span style="white-space:nowrap;">Order ${esc(o.orderNumber)}.</span>`)}
${liveStatus(o.id)}
${button(url, "View order")}
${small("Questions? Just reply to this email.")}`,
  });

  const text = `${meta.headline}

${intro}
Order ${o.orderNumber}

View order: ${url}`;

  return { subject: copy.subject(o.orderNumber), html, text };
}

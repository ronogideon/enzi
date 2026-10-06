import { env } from "../../../config/env";
import { button, esc, FONT, h1, kes, layout, lead, small, type RenderedEmail } from "./layout";
import type { OrderEmailData } from "./order";

export interface StaffOrderData extends OrderEmailData {
  customerPhone: string | null;
}

/** "New order" alert for the people who pack and dispatch it. */
export function staffNewOrderEmail(o: StaffOrderData): RenderedEmail {
  const url = `${env.urls.admin}/orders?order=${encodeURIComponent(o.id)}`;
  const pay = o.isPaid ? "Paid" : o.isPayOnDelivery ? `Pay on delivery — collect ${kes(o.total)}` : "Awaiting payment";
  const items = o.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;${FONT}font-size:14px;color:#111827;">${esc(it.name)}${
          it.variantLabel ? ` <span style="color:#6b7280;">· ${esc(it.variantLabel)}</span>` : ""
        }</td><td align="right" style="padding:6px 0;${FONT}font-size:14px;color:#111827;white-space:nowrap;">× ${it.quantity}</td></tr>`
    )
    .join("");

  const row = (k: string, v: string | null) =>
    v ? `<tr><td style="padding:3px 12px 3px 0;${FONT}font-size:14px;color:#6b7280;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:3px 0;${FONT}font-size:14px;color:#111827;">${v}</td></tr>` : "";

  const html = layout({
    preheader: `${o.orderNumber} · ${kes(o.total)} · ${pay}`,
    body: `${h1(`New order · ${kes(o.total)}`)}
${lead(`<strong style="color:#111827;">${esc(o.orderNumber)}</strong> is ready to be packed.`)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
${row("Customer", esc(o.customerName ?? "Guest"))}
${row("Phone", o.customerPhone ? `<a href="tel:+${esc(o.customerPhone)}" style="color:#111827;">+${esc(o.customerPhone)}</a>` : null)}
${row("Payment", esc(pay))}
${row("Delivery", o.deliveryLabel ? esc(o.deliveryLabel) : null)}
${row("Note", o.deliveryNote ? esc(o.deliveryNote) : null)}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border-top:1px solid #f0f0f0;padding-top:8px;">
${items}
</table>
${button(url, "Open in admin")}
${small("You get these because you're active staff with access to Orders.")}`,
    footer: "Enzi Packaging · Staff notification",
  });

  const text = `New order ${o.orderNumber} — ${kes(o.total)}
Customer: ${o.customerName ?? "Guest"}${o.customerPhone ? ` (+${o.customerPhone})` : ""}
Payment: ${pay}
${o.deliveryLabel ? `Delivery: ${o.deliveryLabel}\n` : ""}${o.deliveryNote ? `Note: ${o.deliveryNote}\n` : ""}
${o.items.map((i) => `- ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} × ${i.quantity}`).join("\n")}

Open in admin: ${url}`;

  return { subject: `New order ${o.orderNumber} · ${kes(o.total)}`, html, text };
}

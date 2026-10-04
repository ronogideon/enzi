import { env } from "../../../config/env";
import { statusImageUrl, trackUrl } from "../tracking-links";

/**
 * Hand-written table HTML with inline styles: the only thing that renders the
 * same in Gmail, Apple Mail and desktop Outlook. No framework, no build step.
 */

export const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Prices are integer cents everywhere in Enzi. Same format as the receipt. */
export const kes = (cents: number) =>
  `Ksh ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

export function layout(opts: { preheader: string; body: string; footer?: string }): string {
  const site = env.urls.storefront;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>Enzi Packaging</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(opts.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;">
    <tr><td style="padding:24px 24px 4px;${FONT}font-size:15px;font-weight:800;letter-spacing:3px;color:#0A0A0B;">ENZI PACKAGING</td></tr>
    <tr><td style="padding:12px 24px 28px;${FONT}font-size:15px;line-height:1.55;color:#111827;">${opts.body}</td></tr>
  </table>
  <p style="${FONT}font-size:12px;line-height:1.5;color:#6b7280;margin:16px 0 0;">
    ${opts.footer ?? "Enzi Packaging · Nairobi, Kenya"}<br>
    <a href="${esc(site)}" style="color:#6b7280;">${esc(site.replace(/^https?:\/\//, ""))}</a>
  </p>
</td></tr></table>
</body></html>`;
}

/** Bulletproof button — renders in desktop Outlook too. */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;"><tr>
<td bgcolor="#0A0A0B" style="border-radius:999px;">
<a href="${esc(href)}" style="display:inline-block;padding:13px 24px;${FONT}font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
}

/**
 * The live part. The image is re-fetched from the API every time the email is
 * opened, so it always shows the current status — even on a months-old email.
 * Wrapped in a link so blocked images still leave a way to track.
 */
export function liveStatus(orderId: string): string {
  return `<a href="${esc(trackUrl(orderId))}" style="display:block;text-decoration:none;margin:0 0 4px;">
<img src="${esc(statusImageUrl(orderId))}" width="552" alt="Live order status — tap to track your order"
 style="display:block;width:100%;max-width:552px;height:auto;border:0;outline:none;${FONT}font-size:14px;color:#111827;">
</a>`;
}

export const h1 = (s: string) =>
  `<p style="margin:0 0 6px;font-size:22px;font-weight:700;line-height:1.3;color:#0A0A0B;">${s}</p>`;
export const lead = (s: string) => `<p style="margin:0 0 20px;color:#4b5563;">${s}</p>`;
export const small = (s: string) =>
  `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">${s}</p>`;
export const firstName = (name: string | null | undefined) =>
  (name ?? "").trim().split(/\s+/)[0] || "there";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

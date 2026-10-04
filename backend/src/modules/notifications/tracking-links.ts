import crypto from "crypto";
import { env } from "../../config/env";

/**
 * Signed, unguessable links for order tracking.
 *
 * Order numbers are sequential (ENZ-2026-000123), so a link keyed on the
 * number alone would let anyone walk through every order. The signature is an
 * HMAC of the order id, so it needs no database column and old emails keep
 * working indefinitely.
 *
 * The key is TRACKING_SECRET if set, otherwise derived from JWT_SECRET — same
 * convention as lib/crypto.ts, so nothing new has to be configured. Changing
 * whichever secret is in use invalidates every link already sent.
 */

const SIG_LEN = 24;
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.TRACKING_SECRET || process.env.JWT_SECRET || "dev-secret";
  cachedKey = crypto.scryptSync(secret, "enzi-tracking-v1", 32);
  return cachedKey;
}

export function signOrder(orderId: string): string {
  return crypto
    .createHmac("sha256", key())
    .update(`order-track:${orderId}`)
    .digest("base64url")
    .slice(0, SIG_LEN);
}

export function verifyOrderSig(orderId: string, sig: string): boolean {
  if (typeof sig !== "string" || sig.length !== SIG_LEN) return false;
  const a = Buffer.from(signOrder(orderId));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Storefront page: /track/<id>/<sig> */
export const trackUrl = (orderId: string) =>
  `${env.urls.storefront}/track/${encodeURIComponent(orderId)}/${signOrder(orderId)}`;

/** The live image embedded in emails. */
export const statusImageUrl = (orderId: string) =>
  `${env.urls.api}/api/track/${encodeURIComponent(orderId)}/${signOrder(orderId)}/status.png`;

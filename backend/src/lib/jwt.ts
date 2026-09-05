import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface StaffTokenPayload {
  sub: string;
  role: string;
  kind: "staff";
}
export interface CustomerTokenPayload {
  sub: string;
  phone: string;
  kind: "customer";
}
export type TokenPayload = StaffTokenPayload | CustomerTokenPayload;

/**
 * Session lifetimes differ by who is holding the token, because the cost of a
 * stolen one differs enormously.
 *
 * Staff sessions are short. An admin token can read every customer's phone
 * number, change payment credentials and issue refunds — and the admin is
 * often signed in on a shared shop computer. A long-lived token there is a
 * standing invitation. Eight hours covers a working day without a re-login
 * mid-shift, and the admin app additionally signs out on inactivity.
 *
 * Customer sessions are long. The worst case for a stolen customer token is
 * someone reading that person's own order history and placing an order that
 * still requires their M-Pesa PIN on their own phone to pay. Making shoppers
 * log in repeatedly costs real sales and buys almost nothing.
 *
 * Both are overridable, but the staff value is deliberately capped: setting
 * JWT_EXPIRES_IN to 30d shouldn't silently apply to admin sessions.
 */
const STAFF_TTL = process.env.STAFF_SESSION_TTL ?? "8h";
const CUSTOMER_TTL = process.env.CUSTOMER_SESSION_TTL ?? env.jwtExpiresIn ?? "90d";

export function signToken(payload: TokenPayload): string {
  const expiresIn = (payload.kind === "staff" ? STAFF_TTL : CUSTOMER_TTL) as
    SignOptions["expiresIn"];
  return jwt.sign(payload, env.jwtSecret, { expiresIn });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}

/** Seconds until a token expires; negative once it has. Used by the admin UI. */
export function secondsUntilExpiry(token: string): number | null {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) return null;
    return decoded.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { HttpError } from "./error";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

function extract(req: Request): TokenPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(header.slice(7));
  } catch {
    return null;
  }
}

/**
 * Is this still a live session?
 *
 * A JWT on its own stays valid until it expires, so resetting a password did
 * nothing to a session someone else was holding, and deactivating a staff
 * member left them signed in for the rest of their 8 hours. Two checks close
 * that:
 *
 *   - tokens issued before the account's passwordChangedAt are rejected
 *   - staff tokens for a deactivated account are rejected
 *
 * Results are cached per account for 30 seconds, so this is roughly one small
 * query per active user per half-minute rather than one per request. A reset on
 * this instance clears the entry immediately via invalidateSession().
 */
type SessionState = { at: number; exists: boolean; active: boolean; changedAt: number };
const CACHE_TTL = 30_000;
const cache = new Map<string, SessionState>();

export function invalidateSession(kind: "staff" | "customer", sub: string) {
  cache.delete(`${kind}:${sub}`);
}

async function sessionState(p: TokenPayload): Promise<SessionState> {
  const key = `${p.kind}:${p.sub}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit;

  let exists = false;
  let active = false;
  let changedAt: Date | null = null;

  if (p.kind === "staff") {
    const row = await prisma.staffUser.findUnique({
      where: { id: p.sub },
      select: { active: true, passwordChangedAt: true },
    });
    exists = !!row;
    active = !!row?.active;
    changedAt = row?.passwordChangedAt ?? null;
  } else {
    const row = await prisma.customer.findUnique({
      where: { id: p.sub },
      select: { passwordChangedAt: true },
    });
    exists = !!row;
    active = exists;
    changedAt = row?.passwordChangedAt ?? null;
  }

  const state: SessionState = { at: Date.now(), exists, active, changedAt: changedAt?.getTime() ?? 0 };
  if (cache.size > 10_000) cache.clear();
  cache.set(key, state);
  return state;
}

async function isLive(p: TokenPayload): Promise<boolean> {
  try {
    const s = await sessionState(p);
    if (!s.exists || !s.active) return false;
    if (s.changedAt && typeof p.iat === "number" && p.iat < Math.floor(s.changedAt / 1000)) return false;
    return true;
  } catch (e) {
    // Database hiccup: let the request through rather than signing everyone
    // out. The route's own queries will fail loudly if the database is down.
    console.error("[auth] session check failed:", e);
    return true;
  }
}

function guard(kind: TokenPayload["kind"], roles?: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const payload = extract(req);
    if (!payload || payload.kind !== kind)
      return next(
        new HttpError(
          401,
          kind === "staff" ? "Staff authentication required" : "Customer authentication required"
        )
      );
    if (roles && payload.kind === "staff" && !roles.includes(payload.role))
      return next(new HttpError(403, "Insufficient permissions"));

    void isLive(payload).then((live) => {
      if (!live) return next(new HttpError(401, "Your session has ended. Please sign in again."));
      req.auth = payload;
      next();
    });
  };
}

// Any authenticated staff member
export const requireStaff = guard("staff");

// Staff with one of the given roles
export function requireRole(...roles: string[]) {
  return guard("staff", roles);
}

// Logged-in customer
export const requireCustomer = guard("customer");

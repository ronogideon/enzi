import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/error";
import {
  requestPasswordReset,
  ResetError,
  resetWithCode,
  resetWithToken,
  type Subject,
} from "./password-reset.service";

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

/**
 * Per-IP limit, in memory. Fine for a single backend instance; the per-account
 * limit in the service is the one that actually protects inboxes and SMS credit,
 * and that one lives in the database.
 */
function ipLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; resetAt: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    const key = req.ip ?? "unknown";
    const h = hits.get(key);
    if (!h || h.resetAt < now) hits.set(key, { n: 1, resetAt: now + windowMs });
    else if (++h.n > limit) return next(new HttpError(429, "Too many attempts. Try again in a few minutes."));
    next();
  };
}

/** Mounted at /api/auth/customer/password and /api/auth/staff/password. */
export function passwordResetRouter(subject: Subject) {
  const r = Router();
  const limiter = ipLimiter(10, 15 * 60_000);

  r.post("/forgot", limiter, (req, res) => {
    const identifier = String(req.body?.identifier ?? "").slice(0, 254).trim();
    // Answer first: identical response and timing whether or not the account exists.
    res.status(202).json({ ok: true });
    if (identifier) {
      requestPasswordReset(subject, identifier, req.ip).catch((e) =>
        console.error("[reset] request failed:", e)
      );
    }
  });

  r.post(
    "/reset",
    limiter,
    wrap(async (req, res) => {
      const body = z
        .object({
          token: z.string().max(200).optional(),
          identifier: z.string().max(254).optional(),
          code: z.string().max(12).optional(),
          password: z.string().max(200),
        })
        .parse(req.body);

      try {
        if (body.token) await resetWithToken(subject, body.token, body.password);
        else await resetWithCode(subject, body.identifier ?? "", (body.code ?? "").trim(), body.password);
      } catch (e) {
        if (e instanceof ResetError) throw new HttpError(400, e.message);
        throw e;
      }
      res.json({ ok: true });
    })
  );

  return r;
}

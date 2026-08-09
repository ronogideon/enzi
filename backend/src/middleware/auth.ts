import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../lib/jwt";
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

// Any authenticated staff member
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const payload = extract(req);
  if (!payload || payload.kind !== "staff")
    throw new HttpError(401, "Staff authentication required");
  req.auth = payload;
  next();
}

// Staff with one of the given roles
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const payload = extract(req);
    if (!payload || payload.kind !== "staff")
      throw new HttpError(401, "Staff authentication required");
    if (!roles.includes(payload.role))
      throw new HttpError(403, "Insufficient permissions");
    req.auth = payload;
    next();
  };
}

// Logged-in customer
export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  const payload = extract(req);
  if (!payload || payload.kind !== "customer")
    throw new HttpError(401, "Customer authentication required");
  req.auth = payload;
  next();
}

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

/** Turn Prisma's error codes into something a human can act on. */
function prismaMessage(err: any): { status: number; message: string } | null {
  if (!err || typeof err.code !== "string" || !err.code.startsWith("P")) return null;
  const target = Array.isArray(err.meta?.target)
    ? err.meta.target.join(", ")
    : err.meta?.target;
  switch (err.code) {
    case "P2002":
      return { status: 409, message: `That ${target ?? "value"} is already in use` };
    case "P2003":
      return { status: 409, message: "This record is still referenced by other data" };
    case "P2025":
      return { status: 404, message: "Record not found" };
    case "P1001":
    case "P1002":
      return { status: 503, message: "Database unreachable — check DATABASE_URL" };
    default:
      return { status: 400, message: `Database error (${err.code})` };
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Validation failures should read as form errors, not 500s.
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const path = first?.path.join(".");
    return res.status(400).json({
      error: path ? `${path}: ${first.message}` : first?.message ?? "Invalid request",
      fields: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    });
  }

  const p = prismaMessage(err);
  if (p) return res.status(p.status).json({ error: p.message });

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

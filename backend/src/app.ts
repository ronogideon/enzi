import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { api } from "./routes";
import { notFound, errorHandler } from "./middleware/error";

/**
 * CORS. The admin SPA and the storefront are on different origins to the API,
 * so every admin request is cross-origin and a blocked preflight surfaces in
 * the browser as an opaque "Failed to fetch" — which is exactly what a
 * misconfigured allow-list looks like from the outside.
 *
 * Rules:
 *   - CORS_ORIGINS unset  -> reflect any origin (safe here: auth is a Bearer
 *     token in a header, not a cookie, so there is no ambient-credential risk).
 *   - CORS_ORIGINS set    -> allow those exact origins, plus any *.railway.app
 *     and *.up.railway.app host, plus localhost on any port.
 *   - An origin that isn't allowed gets a plain response with no CORS headers
 *     rather than a thrown error, so the API never 500s on a browser probe.
 */
function corsOptions(): cors.CorsOptions {
  const allow = env.corsOrigins;
  return {
    origin(origin, cb) {
      // Non-browser callers (curl, Safaricom callbacks, server-side fetch)
      // send no Origin header — always let those through.
      if (!origin) return cb(null, true);
      if (!allow.length) return cb(null, true);
      if (allow.includes(origin)) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        if (host === "localhost" || host === "127.0.0.1") return cb(null, true);
        if (host.endsWith(".railway.app")) return cb(null, true);
        if (host.endsWith(".vercel.app")) return cb(null, true);
      } catch {
        /* malformed Origin — fall through */
      }
      // Deny by omitting the headers, not by erroring.
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  };
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(cors(corsOptions()));
  app.options("*", cors(corsOptions()));

  // Product images are uploaded as base64 JSON (the browser downscales them
  // first), so the default 100kb body limit is far too small.
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  /**
   * Health + setup state. `setupRequired` and `database` let the login screen
   * say something useful ("no admin account exists yet", "database not
   * reachable") instead of the generic "invalid email or password" that a
   * missing account would otherwise produce.
   */
  const health = async (_req: express.Request, res: express.Response) => {
    let database: "ok" | "unreachable" | "no-schema" = "ok";
    let setupRequired = false;
    try {
      setupRequired = (await prisma.staffUser.count()) === 0;
    } catch (e: any) {
      database = typeof e?.code === "string" && e.code.startsWith("P1") ? "unreachable" : "no-schema";
    }
    res.json({
      ok: true,
      service: "enzi-backend",
      version: "0.6.2",
      env: env.nodeEnv,
      database,
      setupRequired,
      time: new Date().toISOString(),
    });
  };

  // Both paths answer: /health for Railway's checker, /api/health so the
  // frontends can verify their configured API base in one request.
  app.get("/health", health);
  app.get("/api/health", health);

  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

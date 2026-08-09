import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { api } from "./routes";
import { notFound, errorHandler } from "./middleware/error";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) =>
    res.json({ ok: true, service: "enzi-backend", version: "0.1.0" })
  );

  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

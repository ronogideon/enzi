import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, "0.0.0.0", () => {
  console.log(`[enzi] v0.4.0 listening on :${env.port} (${env.nodeEnv})`);
  console.log(
    `[enzi] CORS: ${
      env.corsOrigins.length
        ? env.corsOrigins.join(", ") + " (+ localhost, *.railway.app)"
        : "any origin (CORS_ORIGINS unset)"
    }`
  );
  if (!process.env.DATABASE_URL)
    console.warn("[enzi] WARNING: DATABASE_URL is not set — every query will fail.");
  if (!process.env.JWT_SECRET)
    console.warn("[enzi] WARNING: JWT_SECRET is not set — using the dev fallback.");
});

process.on("unhandledRejection", (e) => console.error("[enzi] unhandled rejection", e));

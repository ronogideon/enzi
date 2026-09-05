import { createApp } from "./app";
import { env } from "./config/env";
import { ensureAdminAccount } from "./lib/bootstrap";
import { encryptStoredSecrets } from "./modules/settings/settings.service";

const app = createApp();

app.listen(env.port, "0.0.0.0", async () => {
  console.log(`[enzi] v0.2.0 listening on :${env.port} (${env.nodeEnv})`);
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

  // Guarantees there is always a way into the admin dashboard. Failure here
  // must never stop the server booting — the API is still useful, and the
  // health endpoint will report that setup is required.
  try {
    await ensureAdminAccount();
  } catch (e) {
    console.error("[enzi] Admin bootstrap failed:", e);
  }

  // One-time, idempotent: encrypts any payment credential still stored as
  // plain text from before encryption existed.
  try {
    const migrated = await encryptStoredSecrets();
    if (migrated) console.log(`[enzi] Encrypted ${migrated} stored credential(s) at rest.`);
  } catch (e) {
    console.error("[enzi] Could not encrypt stored credentials:", e);
  }
});

process.on("unhandledRejection", (e) => console.error("[enzi] unhandled rejection", e));

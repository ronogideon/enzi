import dotenv from "dotenv";
dotenv.config();

/** "api.example.com" -> "https://api.example.com"; strips trailing slashes and /api. */
function absolute(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) {
    u = (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u) ? "http://" : "https://") + u;
  }
  return u.replace(/\/api$/i, "");
}

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: required("JWT_SECRET", "dev-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",

  mpesa: {
    env: process.env.MPESA_ENV ?? "sandbox",
    consumerKey: process.env.MPESA_CONSUMER_KEY ?? "",
    consumerSecret: process.env.MPESA_CONSUMER_SECRET ?? "",
    shortcode: process.env.MPESA_SHORTCODE ?? "",
    passkey: process.env.MPESA_PASSKEY ?? "",
    callbackUrl: process.env.MPESA_CALLBACK_URL ?? "",
  },

  at: {
    apiKey: process.env.AT_API_KEY ?? "",
    username: process.env.AT_USERNAME ?? "",
    senderId: process.env.AT_SENDER_ID ?? "ENZI",
  },

  /**
   * Public addresses. Emails link to these, and the live status image in every
   * order email is served from PUBLIC_API_URL — so it has to be a stable public
   * address (your custom domain), not something that changes between deploys.
   */
  urls: {
    api: absolute(
      process.env.PUBLIC_API_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN ? process.env.RAILWAY_PUBLIC_DOMAIN : "") ||
        `http://localhost:${process.env.PORT ?? "4000"}`
    ),
    storefront: absolute(process.env.STOREFRONT_URL || "https://enzipackaging.com"),
    admin: absolute(process.env.ADMIN_URL || "http://localhost:5173"),
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    fromOrders: process.env.EMAIL_FROM_ORDERS || "Enzi Packaging <orders@enzipackaging.com>",
    fromAccount: process.env.EMAIL_FROM_ACCOUNT || "Enzi Packaging <no-reply@enzipackaging.com>",
    /** Falls back to Settings → Store email when unset. */
    replyTo: process.env.EMAIL_REPLY_TO ?? "",
  },

  store: {
    name: process.env.STORE_NAME ?? "Enzi Packaging",
    orderPrefix: process.env.ORDER_PREFIX ?? "ENZ",
  },
};

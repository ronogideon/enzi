import dotenv from "dotenv";
dotenv.config();

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

  store: {
    name: process.env.STORE_NAME ?? "Enzi Packaging",
    orderPrefix: process.env.ORDER_PREFIX ?? "ENZ",
  },
};

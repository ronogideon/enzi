import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { encryptSecret, decryptSecret, isEncrypted } from "../../lib/crypto";

/**
 * Settings live in Postgres so the shop owner can change them from the admin
 * dashboard without a redeploy. Environment variables remain the fallback, so
 * an existing Railway deployment keeps working untouched until someone saves a
 * value in the UI.
 *
 * Resolution order for every key:  database  ->  environment  ->  default.
 *
 * Keys flagged `secret` are never sent to the browser in full. The settings
 * endpoint returns a masked preview ("••••••1234") and the UI only ever PUTs a
 * new value — it never round-trips the old one back, so a save can't silently
 * overwrite a real key with its own mask.
 */

export const SECRET_KEYS = new Set([
  "mpesa.consumerKey",
  "mpesa.consumerSecret",
  "mpesa.passkey",
  "kopokopo.clientSecret",
  "kopokopo.apiKey",
  "sms.apiKey",
]);

/** Every key the admin UI knows how to edit, with where it falls back to. */
export const SETTING_DEFAULTS: Record<string, () => string> = {
  // storefront / business
  "store.name": () => env.store.name,
  "store.phone": () => "",
  "store.email": () => "",
  "store.address": () => "",
  "store.whatsapp": () => "",
  "store.freeDeliveryThreshold": () => "",

  // M-Pesa Daraja
  "mpesa.enabled": () => "true",
  "mpesa.env": () => env.mpesa.env,
  "mpesa.consumerKey": () => env.mpesa.consumerKey,
  "mpesa.consumerSecret": () => env.mpesa.consumerSecret,
  "mpesa.shortcode": () => env.mpesa.shortcode,
  "mpesa.passkey": () => env.mpesa.passkey,
  "mpesa.callbackUrl": () => env.mpesa.callbackUrl,
  "mpesa.transactionType": () => "CustomerPayBillOnline",

  // Which gateway takes online payments. "mpesa" talks to Daraja directly;
  // "kopokopo" routes through Kopo Kopo's till.
  "payments.provider": () => "mpesa",

  // Kopo Kopo
  "kopokopo.enabled": () => "false",
  "kopokopo.env": () => process.env.KOPOKOPO_ENV ?? "sandbox",
  "kopokopo.clientId": () => process.env.KOPOKOPO_CLIENT_ID ?? "",
  "kopokopo.clientSecret": () => process.env.KOPOKOPO_CLIENT_SECRET ?? "",
  "kopokopo.apiKey": () => process.env.KOPOKOPO_API_KEY ?? "",
  "kopokopo.tillNumber": () => process.env.KOPOKOPO_TILL_NUMBER ?? "",
  "kopokopo.callbackUrl": () => process.env.KOPOKOPO_CALLBACK_URL ?? "",

  // Africa's Talking SMS
  "sms.enabled": () => "true",
  "sms.username": () => env.at.username,
  "sms.apiKey": () => env.at.apiKey,
  "sms.senderId": () => env.at.senderId,
};

let cache: Map<string, string> | null = null;
let cachedAt = 0;
const TTL_MS = 15_000;

async function load(): Promise<Map<string, string>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await prisma.setting.findMany();
  const map = new Map<string, string>();
  for (const row of rows) {
    const v = row.value;
    if (v === null || v === undefined) continue;
    const raw = typeof v === "string" ? v : JSON.stringify(v);
    // Secrets are stored encrypted; everything else is plain. Values saved
    // before encryption existed pass through untouched.
    map.set(row.key, SECRET_KEYS.has(row.key) ? decryptSecret(raw) : raw);
  }
  cache = map;
  cachedAt = Date.now();
  return map;
}

/** Drop the cache after a write so the next read sees the new value. */
export function invalidateSettings() {
  cache = null;
  cachedAt = 0;
}

/** Resolved value: database first, then env fallback, then "". */
export async function getSetting(key: string): Promise<string> {
  const db = (await load()).get(key);
  if (db !== undefined && db !== "") return db;
  return SETTING_DEFAULTS[key]?.() ?? "";
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const map = await load();
  const out: Record<string, string> = {};
  for (const key of keys) {
    const db = map.get(key);
    out[key] = db !== undefined && db !== "" ? db : SETTING_DEFAULTS[key]?.() ?? "";
  }
  return out;
}

export async function getBool(key: string, fallback = false): Promise<boolean> {
  const v = (await getSetting(key)).toLowerCase();
  if (v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

export async function setSetting(key: string, value: string) {
  const secret = SECRET_KEYS.has(key);
  // Encrypt before it ever reaches Postgres, so a database dump alone can't
  // give up the shop's payment credentials.
  const stored = secret && value ? encryptSecret(value) : value;

  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, secret },
    update: { value: stored, secret },
  });
  invalidateSettings();
}

/**
 * Encrypts any secret still sitting in the database as plain text. Runs once at
 * startup so an existing deployment is protected without anyone re-entering
 * their keys by hand.
 */
export async function encryptStoredSecrets(): Promise<number> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...SECRET_KEYS] } },
  });

  let migrated = 0;
  for (const row of rows) {
    const raw = typeof row.value === "string" ? row.value : null;
    if (!raw || isEncrypted(raw)) continue;
    await prisma.setting.update({
      where: { key: row.key },
      data: { value: encryptSecret(raw), secret: true },
    });
    migrated++;
  }
  if (migrated) invalidateSettings();
  return migrated;
}

/** "••••••4821" — enough to confirm which key is loaded, useless if leaked. */
export function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••••" + value.slice(-4);
}

/**
 * The shape the admin Settings page consumes: every known key, with secrets
 * masked and a flag saying whether the live value came from the database or
 * is still falling back to an environment variable.
 */
export async function describeSettings() {
  const map = await load();
  const out: Record<
    string,
    { value: string; secret: boolean; isSet: boolean; source: "database" | "environment" | "unset" }
  > = {};

  for (const key of Object.keys(SETTING_DEFAULTS)) {
    const dbValue = map.get(key);
    const envValue = SETTING_DEFAULTS[key]?.() ?? "";
    const hasDb = dbValue !== undefined && dbValue !== "";
    const live = hasDb ? dbValue! : envValue;
    const secret = SECRET_KEYS.has(key);

    out[key] = {
      value: secret ? mask(live) : live,
      secret,
      isSet: live !== "",
      source: hasDb ? "database" : live ? "environment" : "unset",
    };
  }
  return out;
}

/** Live M-Pesa credentials for the payment service. */
export async function mpesaConfig() {
  const s = await getSettings([
    "mpesa.env",
    "mpesa.consumerKey",
    "mpesa.consumerSecret",
    "mpesa.shortcode",
    "mpesa.passkey",
    "mpesa.callbackUrl",
    "mpesa.transactionType",
  ]);
  return {
    env: s["mpesa.env"] || "sandbox",
    consumerKey: s["mpesa.consumerKey"],
    consumerSecret: s["mpesa.consumerSecret"],
    shortcode: s["mpesa.shortcode"],
    passkey: s["mpesa.passkey"],
    callbackUrl: s["mpesa.callbackUrl"],
    transactionType:
      s["mpesa.transactionType"] === "CustomerBuyGoodsOnline"
        ? "CustomerBuyGoodsOnline"
        : "CustomerPayBillOnline",
    enabled: await getBool("mpesa.enabled", true),
  };
}

/** Live Kopo Kopo credentials for the payment service. */
export async function kopokopoConfig() {
  const s = await getSettings([
    "kopokopo.env",
    "kopokopo.clientId",
    "kopokopo.clientSecret",
    "kopokopo.apiKey",
    "kopokopo.tillNumber",
    "kopokopo.callbackUrl",
  ]);
  return {
    env: s["kopokopo.env"] === "production" ? "production" : "sandbox",
    clientId: s["kopokopo.clientId"],
    clientSecret: s["kopokopo.clientSecret"],
    apiKey: s["kopokopo.apiKey"],
    tillNumber: s["kopokopo.tillNumber"],
    callbackUrl: s["kopokopo.callbackUrl"],
    enabled: await getBool("kopokopo.enabled", false),
  };
}

/**
 * Which gateway online payments go through. Falls back to whichever is
 * actually configured, so a half-finished switch can't leave checkout with no
 * working payment method at all.
 */
export async function activePaymentProvider(): Promise<"mpesa" | "kopokopo" | "none"> {
  const chosen = (await getSetting("payments.provider")).toLowerCase();

  const [mpesa, kopokopo] = await Promise.all([mpesaConfig(), kopokopoConfig()]);
  const mpesaReady =
    mpesa.enabled && !!mpesa.consumerKey && !!mpesa.consumerSecret && !!mpesa.shortcode;
  const kopokopoReady =
    kopokopo.enabled && !!kopokopo.clientId && !!kopokopo.clientSecret && !!kopokopo.tillNumber;

  if (chosen === "kopokopo" && kopokopoReady) return "kopokopo";
  if (chosen === "mpesa" && mpesaReady) return "mpesa";

  // Chosen provider isn't usable — fall back to the other one if it is.
  if (kopokopoReady) return "kopokopo";
  if (mpesaReady) return "mpesa";
  return "none";
}

/** Live Africa's Talking credentials for the SMS service. */
export async function smsConfig() {
  const s = await getSettings(["sms.username", "sms.apiKey", "sms.senderId"]);
  return {
    username: s["sms.username"],
    apiKey: s["sms.apiKey"],
    senderId: s["sms.senderId"] || "ENZI",
    enabled: await getBool("sms.enabled", true),
  };
}

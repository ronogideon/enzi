import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { requireStaff, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/error";
import {
  describeSettings,
  setSetting,
  SETTING_DEFAULTS,
  mpesaConfig,
  smsConfig,
  activePaymentProvider,
} from "./settings.service";
import { testKopokopoConnection, resetKopokopoToken } from "../payments/kopokopo.service";
import { isOwnerOnlySetting, audit } from "../../lib/permissions";
import { talkSasaBalance } from "../sms/talksasa.service";

export const settingsRouter = Router();


const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

/**
 * Public site config — socials, analytics IDs, contact details, SEO defaults.
 * No auth: every value here is rendered publicly on the storefront anyway, and
 * the storefront needs it server-side to build metadata and the sitemap.
 * Contains no credentials.
 */
settingsRouter.get(
  "/public",
  wrap(async (_req, res) => {
    const { publicSiteConfig } = await import("./settings.service");
    res.set("Cache-Control", "public, max-age=60");
    res.json(await publicSiteConfig());
  })
);

/**
 * Read every editable setting. Secrets come back masked, plus a `source` so the
 * UI can show whether a value is coming from the database or is still falling
 * back to a Railway environment variable.
 */
settingsRouter.get(
  "/",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(await describeSettings());
  })
);

/** Save one setting. Admins only — this is where the payment keys live. */
settingsRouter.put(
  "/:key",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const key = req.params.key;
    if (!(key in SETTING_DEFAULTS)) throw new HttpError(400, `Unknown setting: ${key}`);

    const { value } = z
      .object({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]) })
      .parse(req.body);

    const asString =
      value === null || value === undefined ? "" : String(value).trim();

    // Guard against the mask being saved back over a real credential if a
    // client ever echoes the GET response into a PUT.
    if (asString.startsWith("••••")) throw new HttpError(400, "Masked value rejected");

    // Payment credentials and the shop's public links stay with the owner —
    // they move money and represent the brand publicly.
    if (isOwnerOnlySetting(key) && req.auth!.role !== "SUPERADMIN")
      throw new HttpError(403, "Only the owner can change payment keys and social links.");

    await setSetting(key, asString);
    await audit(req.auth!, {
      action: "settings.update",
      entity: "setting",
      entityId: key,
      // The value itself is never logged — several of these are secrets.
      summary: `Changed setting ${key}`,
    });
    if (key.startsWith("kopokopo.")) resetKopokopoToken();
    res.json({ ok: true, key });
  })
);

/** Save several at once — the Settings page saves a whole tab in one click. */
settingsRouter.put(
  "/",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const { values } = z
      .object({ values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])) })
      .parse(req.body);

    const saved: string[] = [];
    for (const [key, raw] of Object.entries(values)) {
      if (!(key in SETTING_DEFAULTS)) continue;
      const asString = raw === null || raw === undefined ? "" : String(raw).trim();
      if (asString.startsWith("••••")) continue; // unchanged secret — leave it alone
      if (isOwnerOnlySetting(key) && req.auth!.role !== "SUPERADMIN")
        throw new HttpError(403, "Only the owner can change payment keys and social links.");
      await setSetting(key, asString);
      if (key.startsWith("kopokopo.")) resetKopokopoToken();
      saved.push(key);
    }
    if (saved.length)
      await audit(req.auth!, {
        action: "settings.update",
        entity: "setting",
        summary: `Changed ${saved.length} setting(s): ${saved.join(", ")}`,
      });
    res.json({ ok: true, saved });
  })
);

/**
 * Verify the saved M-Pesa credentials by asking Daraja for an access token.
 * Cheap, side-effect free, and tells the owner immediately whether the keys
 * they just pasted actually work — rather than finding out at checkout.
 */
settingsRouter.post(
  "/test/mpesa",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (_req, res) => {
    const cfg = await mpesaConfig();
    const missing = (["consumerKey", "consumerSecret", "shortcode", "passkey"] as const)
      .filter((k) => !cfg[k]);
    if (missing.length)
      return res.status(400).json({ ok: false, error: `Missing: ${missing.join(", ")}` });

    const host =
      cfg.env === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
    const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");

    try {
      const { data } = await axios.get(
        `${host}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` }, timeout: 15000 }
      );
      if (!data?.access_token)
        return res.status(400).json({ ok: false, error: "Daraja returned no access token" });
      res.json({
        ok: true,
        message: `Authenticated against ${cfg.env}. Shortcode ${cfg.shortcode}.`,
        callbackUrl: cfg.callbackUrl || "(not set — payments cannot confirm)",
      });
    } catch (e: any) {
      res.status(400).json({
        ok: false,
        error:
          e?.response?.data?.errorMessage ??
          e?.response?.statusText ??
          e?.message ??
          "Could not reach Daraja",
      });
    }
  })
);

/** Verify the saved Kopo Kopo credentials by fetching an OAuth token. */
settingsRouter.post(
  "/test/kopokopo",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (_req, res) => {
    const result = await testKopokopoConnection();
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  })
);

/** Which gateway checkout will actually use, and why. */
settingsRouter.get(
  "/payment-provider",
  requireStaff,
  wrap(async (_req, res) => {
    res.json({ provider: await activePaymentProvider() });
  })
);

/** Verify the Talk Sasa token by reading the account balance. */
settingsRouter.post(
  "/test/sms",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (_req, res) => {
    const cfg = await smsConfig();
    const result = await talkSasaBalance();

    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });

    // Report the sender ID back: an unregistered one is the commonest reason
    // messages disappear without any error at all.
    res.json({
      ok: true,
      message: `Connected to Talk Sasa. Balance: ${result.balance}. Sending as "${cfg.senderId}" — make sure that sender ID is registered with Talk Sasa, or messages will silently fail to deliver.`,
    });
  })
);

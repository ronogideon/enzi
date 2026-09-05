import axios from "axios";
import crypto from "crypto";
import { normalizePhone } from "../../lib/phone";
import { HttpError } from "../../middleware/error";
import { kopokopoConfig } from "../settings/settings.service";

/**
 * Kopo Kopo (K2) as an alternative to talking to Daraja directly.
 *
 * Why anyone would choose it: Kopo Kopo settles to a till you already own,
 * handles the Safaricom relationship for you, and its dashboard reconciles
 * payments — so a shop that finds Daraja's onboarding painful can be taking
 * card-free payments the same day. The trade-off is a transaction fee and one
 * more third party in the path.
 *
 * Credentials come from the settings service (database first, environment
 * second), so they are editable from the admin dashboard without a redeploy —
 * exactly like the M-Pesa keys.
 */

function hostFor(env: string) {
  return env === "production" ? "https://api.kopokopo.com" : "https://sandbox.kopokopo.com";
}

/**
 * Access tokens are valid for roughly an hour. Cache in memory and refresh a
 * minute early — a checkout stalling because a token expired mid-request is a
 * lost sale, and Kopo Kopo rate-limits token issuance.
 */
let cached: { token: string; expiresAt: number; key: string } | null = null;

async function getAccessToken(cfg: {
  env: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const key = `${cfg.env}:${cfg.clientId}`;
  if (cached && cached.key === key && Date.now() < cached.expiresAt) return cached.token;

  try {
    const { data } = await axios.post(
      `${hostFor(cfg.env)}/oauth/token`,
      {
        grant_type: "client_credentials",
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 20000 }
    );

    if (!data?.access_token)
      throw new HttpError(502, "Kopo Kopo did not return an access token");

    const ttl = Number(data.expires_in ?? 3600);
    cached = {
      key,
      token: data.access_token,
      expiresAt: Date.now() + Math.max(60, ttl - 60) * 1000,
    };
    return cached.token;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      502,
      "Could not authenticate with Kopo Kopo. Check the client ID and secret in Settings → Payments."
    );
  }
}

/** Clears the token cache — called when the credentials are edited. */
export function resetKopokopoToken() {
  cached = null;
}

export interface KopokopoStkResult {
  paymentRequestId: string;
  customerMessage: string;
}

/**
 * Ask Kopo Kopo to send an STK prompt to the customer's phone.
 *
 * The response carries the created resource's URL in the Location header
 * rather than in the body; its last path segment is the id we poll and match
 * webhooks against.
 */
export async function initiateKopokopoStk(params: {
  phone: string;
  amountKes: number;
  reference: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<KopokopoStkResult> {
  const cfg = await kopokopoConfig();

  const missing = (["clientId", "clientSecret", "tillNumber"] as const).filter((k) => !cfg[k]);
  if (missing.length)
    throw new HttpError(
      503,
      `Kopo Kopo is not configured yet (missing: ${missing.join(", ")}). Add the credentials in Settings → Payments.`
    );
  if (!cfg.callbackUrl)
    throw new HttpError(
      503,
      "Kopo Kopo callback URL is not set — payments would never confirm. Set it in Settings → Payments."
    );

  const token = await getAccessToken(cfg);
  const phone = normalizePhone(params.phone);

  try {
    const res = await axios.post(
      `${hostFor(cfg.env)}/api/v1/incoming_payments`,
      {
        payment_channel: "M-PESA STK Push",
        till_number: cfg.tillNumber,
        subscriber: {
          first_name: params.firstName || "Customer",
          last_name: params.lastName || "-",
          phone_number: `+${phone}`,
          ...(params.email ? { email: params.email } : {}),
        },
        amount: {
          currency: "KES",
          // Kopo Kopo rejects fractional amounts, same as Daraja.
          value: String(Math.max(1, Math.round(params.amountKes))),
        },
        metadata: { reference: params.reference },
        _links: { callback_url: cfg.callbackUrl },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    const location: string | undefined = res.headers?.location ?? res.data?._links?.self;
    const paymentRequestId = location?.split("/").filter(Boolean).pop();

    if (!paymentRequestId)
      throw new HttpError(502, "Kopo Kopo accepted the request but returned no reference");

    return {
      paymentRequestId,
      customerMessage: "Check your phone and enter your M-PESA PIN to complete payment.",
    };
  } catch (e: any) {
    if (e instanceof HttpError) throw e;

    // A stale cached token would otherwise fail every retry too.
    if (e?.response?.status === 401) resetKopokopoToken();

    const detail =
      e?.response?.data?.error_message ??
      e?.response?.data?.errorMessage ??
      e?.response?.data?.error?.message ??
      e?.message;
    throw new HttpError(502, `Kopo Kopo request failed: ${detail ?? "unknown error"}`);
  }
}

/**
 * Verify a webhook actually came from Kopo Kopo.
 *
 * They sign the raw request body with HMAC-SHA256 using your API key and send
 * it as X-KopoKopo-Signature. Without this check, anyone who learns the
 * callback URL could mark orders paid — so an unverifiable payload is dropped
 * rather than trusted.
 */
export function verifyKopokopoSignature(
  rawBody: string,
  signature: string | undefined,
  apiKey: string
): boolean {
  if (!signature || !apiKey) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody, "utf8").digest("hex");

  // Constant-time compare; a length mismatch would throw in timingSafeEqual.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Flatten the webhook body into the fields the payment record needs. */
export function parseKopokopoWebhook(body: any) {
  const data = body?.data ?? {};
  const attributes = data.attributes ?? {};
  const event = attributes.event ?? {};
  const resource = event.resource ?? {};

  const status: string | undefined = attributes.status ?? resource.status;

  return {
    // The id here matches the payment request id returned when we initiated.
    paymentRequestId: data.id as string | undefined,
    topic: body?.topic as string | undefined,
    status,
    success: typeof status === "string" && status.toLowerCase() === "success",
    reference: (resource.reference ?? resource.origination_time) as string | undefined,
    amount: resource.amount as string | undefined,
    phone: resource.sender_phone_number as string | undefined,
    errorMessage: (event.errors ?? attributes.errors) as string | undefined,
  };
}

/** Cheap credential check for the Settings page — fetches a token, nothing more. */
export async function testKopokopoConnection() {
  const cfg = await kopokopoConfig();
  const missing = (["clientId", "clientSecret", "tillNumber"] as const).filter((k) => !cfg[k]);
  if (missing.length) return { ok: false as const, error: `Missing: ${missing.join(", ")}` };

  resetKopokopoToken();
  try {
    await getAccessToken(cfg);
    return {
      ok: true as const,
      message: `Authenticated against ${cfg.env}. Till ${cfg.tillNumber}.`,
      callbackUrl: cfg.callbackUrl || "(not set — payments cannot confirm)",
    };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "Could not reach Kopo Kopo" };
  }
}

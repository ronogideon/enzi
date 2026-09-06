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
    // The SDK sends this form-encoded with a User-Agent; match it exactly so we
    // behave identically to a request Kopo Kopo has tested against.
    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    const { data } = await axios.post(`${hostFor(cfg.env)}/oauth/token`, form.toString(), {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Enzi-Kopokopo/1.0",
      },
      timeout: 20000,
    });

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
  /** Full Kopo Kopo resource URL — poll this to get the definitive status. */
  statusUrl: string;
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
          "User-Agent": "Enzi-Kopokopo/1.0",
        },
        timeout: 30000,
      }
    );

    // The created resource's URL comes back in the Location header. Its last
    // path segment is the id; the full URL is what we poll for status.
    const location: string | undefined =
      res.headers?.location ?? res.headers?.Location ?? res.data?._links?.self;
    const paymentRequestId = location?.split("/").filter(Boolean).pop();

    if (!location || !paymentRequestId)
      throw new HttpError(502, "Kopo Kopo accepted the request but returned no reference");

    return {
      paymentRequestId,
      statusUrl: location,
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
/**
 * Verify a webhook signature the way Kopo Kopo actually signs it.
 *
 * This was the bug that stopped every payment confirming: Kopo Kopo's own SDK
 * computes the HMAC over `JSON.stringify(req.body)` — the RE-SERIALISED parsed
 * body — NOT the raw request bytes. Our previous code hashed the raw bytes, so
 * the digest never matched, every callback was rejected 401, and no order was
 * ever marked paid.
 *
 * The signature is a hex digest; the compare is done over hex buffers with a
 * constant-time comparison, matching lib/helpers/auth.js in the SDK.
 */
export function verifyKopokopoSignature(
  signedPayload: string,
  signature: string | undefined,
  apiKey: string
): boolean {
  if (!signature || !apiKey) return false;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(signedPayload, "utf8")
    .digest("hex");

  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, "hex");
    b = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Query a payment's status directly from Kopo Kopo by GETting its resource URL.
 *
 * This is the SDK's `getStatus`, and it's the answer to "is Kopo Kopo actually
 * reporting to us?" — we don't have to wait for the webhook at all. After the
 * STK we can poll this URL and read the real outcome straight from K2, which
 * makes confirmation work even if the callback never arrives.
 *
 * Returns the same shape as the parsed webhook, so callers handle both
 * identically.
 */
export async function queryKopokopoStatus(statusUrl: string): Promise<{
  status: string | undefined;
  success: boolean;
  settled: boolean;
  reference: string | undefined;
  errorMessage: string | undefined;
} | null> {
  if (!statusUrl) return null;
  const cfg = await kopokopoConfig();
  if (!cfg.clientId || !cfg.clientSecret) return null;

  try {
    const token = await getAccessToken(cfg);
    const { data } = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "Enzi-Kopokopo/1.0",
      },
      timeout: 20000,
    });

    const attributes = data?.data?.attributes ?? {};
    // The top-level attributes.status is the request outcome: Pending, Success,
    // or Failed. The nested resource.status ("Received") is the money movement
    // and only appears on success — so the OUTCOME we key on is the former.
    const status: string | undefined = attributes.status;
    const norm = (status ?? "").toLowerCase();
    const resource = attributes.event?.resource ?? {};

    return {
      status,
      success: norm === "success",
      // "Pending" means the customer hasn't acted yet; anything that isn't
      // success or pending is a terminal failure.
      settled: norm === "success" || (norm !== "pending" && norm !== ""),
      reference: attributes.metadata?.reference ?? resource.reference,
      errorMessage: attributes.event?.errors ?? undefined,
    };
  } catch {
    // Network hiccup or not-ready — treat as "still pending", let the caller
    // poll again.
    return null;
  }
}

/** Flatten the webhook body into the fields the payment record needs. */
export function parseKopokopoWebhook(body: any) {
  // Shape confirmed against the SDK's own test fixture
  // (test/response/hooks/stksuccessresult.js):
  //   data.id                             -> the incoming_payment id (our providerRef)
  //   data.attributes.status              -> "Success" | "Failed" | "Pending"  <- the OUTCOME
  //   data.attributes.event.resource.*    -> the money-movement detail
  //   data.attributes.event.errors        -> failure detail, null on success
  //   data.attributes.metadata.reference  -> our order number, set at initiation
  const data = body?.data ?? {};
  const attributes = data.attributes ?? {};
  const event = attributes.event ?? {};
  const resource = event.resource ?? {};

  // The request outcome lives at attributes.status. resource.status is
  // "Received" and is NOT the field to branch on.
  const status: string | undefined = attributes.status;
  const norm = (status ?? "").toLowerCase();

  return {
    paymentRequestId: (data.id ?? attributes.id) as string | undefined,
    topic: (attributes.event?.type ?? body?.topic) as string | undefined,
    status,
    success: norm === "success",
    reference: (attributes.metadata?.reference ?? resource.reference) as string | undefined,
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

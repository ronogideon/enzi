import axios from "axios";
import { normalizePhone } from "../../lib/phone";
import { HttpError } from "../../middleware/error";
import { mpesaConfig } from "../settings/settings.service";

/**
 * Credentials are read per-request from the settings service, which resolves
 * database first and environment second. That means the shop owner can paste
 * new Daraja keys into the admin dashboard and the very next checkout uses
 * them — no redeploy, no Railway variable edit.
 */

function hostFor(mpesaEnv: string) {
  return mpesaEnv === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function getAccessToken(cfg: { env: string; consumerKey: string; consumerSecret: string }) {
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  try {
    const { data } = await axios.get(
      `${hostFor(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` }, timeout: 20000 }
    );
    if (!data?.access_token)
      throw new HttpError(502, "M-Pesa did not return an access token");
    return data.access_token as string;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      502,
      "Could not authenticate with M-Pesa. Check the consumer key and secret in Settings → Payments."
    );
  }
}

export interface StkResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  customerMessage: string;
}

/**
 * Initiate an STK push. `amountKes` is whole shillings (Daraja rejects cents).
 * `accountRef` is shown on the customer's prompt — use the order number.
 */
export async function initiateStkPush(params: {
  phone: string;
  amountKes: number;
  accountRef: string;
  description?: string;
}): Promise<StkResult> {
  const cfg = await mpesaConfig();

  const missing = (["consumerKey", "consumerSecret", "shortcode", "passkey"] as const).filter(
    (k) => !cfg[k]
  );
  if (missing.length)
    throw new HttpError(
      503,
      `M-Pesa is not configured yet (missing: ${missing.join(", ")}). Add the credentials in Settings → Payments.`
    );
  if (!cfg.callbackUrl)
    throw new HttpError(
      503,
      "M-Pesa callback URL is not set — payments would never confirm. Set it in Settings → Payments."
    );

  const token = await getAccessToken(cfg);
  const ts = timestamp();
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64");

  try {
    const { data } = await axios.post(
      `${hostFor(cfg.env)}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: cfg.shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: cfg.transactionType,
        Amount: Math.max(1, Math.round(params.amountKes)),
        PartyA: normalizePhone(params.phone),
        PartyB: cfg.shortcode,
        PhoneNumber: normalizePhone(params.phone),
        CallBackURL: cfg.callbackUrl,
        AccountReference: params.accountRef.slice(0, 12),
        TransactionDesc: (params.description ?? "Enzi order").slice(0, 13),
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
    );

    if (data?.ResponseCode && data.ResponseCode !== "0")
      throw new HttpError(502, data.ResponseDescription ?? "M-Pesa rejected the request");

    return {
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      responseCode: data.ResponseCode,
      customerMessage: data.CustomerMessage,
    };
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    const detail =
      e?.response?.data?.errorMessage ?? e?.response?.data?.ResponseDescription ?? e?.message;
    throw new HttpError(502, `M-Pesa request failed: ${detail ?? "unknown error"}`);
  }
}

/** Parse the messy Daraja callback into a flat shape. */
export function parseStkCallback(body: any) {
  const cb = body?.Body?.stkCallback ?? {};
  const items: any[] = cb?.CallbackMetadata?.Item ?? [];
  const meta = (name: string) => items.find((i) => i.Name === name)?.Value;
  return {
    merchantRequestId: cb.MerchantRequestID as string | undefined,
    checkoutRequestId: cb.CheckoutRequestID as string | undefined,
    resultCode: cb.ResultCode as number | undefined,
    resultDesc: cb.ResultDesc as string | undefined,
    mpesaReceipt: meta("MpesaReceiptNumber") as string | undefined,
    amount: meta("Amount") as number | undefined,
    phone: meta("PhoneNumber")?.toString(),
  };
}

/**
 * Human-readable meaning of a Daraja STK result code. These are the codes
 * Safaricom actually returns on the callback, translated into something a
 * customer staring at a checkout screen can act on.
 */
export function describeMpesaResult(code: number | null | undefined): {
  outcome: "success" | "cancelled" | "timeout" | "wrong_pin" | "insufficient" | "failed";
  message: string;
} {
  switch (code) {
    case 0:
      return { outcome: "success", message: "Payment received. Thank you!" };
    case 1032:
      return { outcome: "cancelled", message: "You cancelled the payment prompt." };
    case 1037:
      return {
        outcome: "timeout",
        message: "The prompt timed out — it wasn't answered in time. Try again.",
      };
    case 2001:
      return { outcome: "wrong_pin", message: "The M-PESA PIN entered was wrong. Try again." };
    case 1:
      return {
        outcome: "insufficient",
        message: "Not enough balance in the M-PESA account. Top up and try again.",
      };
    default:
      return {
        outcome: "failed",
        message: "The payment didn't go through. You can try again.",
      };
  }
}

/**
 * Ask Daraja directly whether an STK request succeeded, instead of waiting for
 * the callback. This is the safety net for when the callback URL is
 * misconfigured or the callback is slow: the checkout can poll this and still
 * confirm the payment.
 */
export async function queryStkStatus(checkoutRequestId: string): Promise<{
  resultCode: number | null;
  resultDesc: string | null;
} | null> {
  const cfg = await mpesaConfig();
  if (!cfg.consumerKey || !cfg.shortcode || !cfg.passkey) return null;

  const token = await getAccessToken(cfg);
  const ts = timestamp();
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64");

  try {
    const { data } = await axios.post(
      `${hostFor(cfg.env)}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: cfg.shortcode,
        Password: password,
        Timestamp: ts,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
    );
    // ResultCode comes back as a string here, unlike on the callback.
    const rc = data?.ResultCode;
    return {
      resultCode: rc === undefined || rc === null ? null : Number(rc),
      resultDesc: data?.ResultDesc ?? null,
    };
  } catch (e: any) {
    // "still being processed" is reported as an error; treat it as pending.
    return null;
  }
}

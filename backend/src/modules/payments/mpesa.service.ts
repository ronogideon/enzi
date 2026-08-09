import axios from "axios";
import { env } from "../../config/env";
import { normalizePhone } from "../../lib/phone";

const BASE =
  env.mpesa.env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

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

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${env.mpesa.consumerKey}:${env.mpesa.consumerSecret}`
  ).toString("base64");
  const { data } = await axios.get(
    `${BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return data.access_token as string;
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
  const token = await getAccessToken();
  const ts = timestamp();
  const password = Buffer.from(
    `${env.mpesa.shortcode}${env.mpesa.passkey}${ts}`
  ).toString("base64");

  const { data } = await axios.post(
    `${BASE}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: env.mpesa.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(params.amountKes)),
      PartyA: normalizePhone(params.phone),
      PartyB: env.mpesa.shortcode,
      PhoneNumber: normalizePhone(params.phone),
      CallBackURL: env.mpesa.callbackUrl,
      AccountReference: params.accountRef.slice(0, 12),
      TransactionDesc: (params.description ?? "Enzi order").slice(0, 13),
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
    responseCode: data.ResponseCode,
    customerMessage: data.CustomerMessage,
  };
}

/** Parse the messy Daraja callback into a flat shape. */
export function parseStkCallback(body: any) {
  const cb = body?.Body?.stkCallback ?? {};
  const items: any[] = cb?.CallbackMetadata?.Item ?? [];
  const meta = (name: string) =>
    items.find((i) => i.Name === name)?.Value;
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

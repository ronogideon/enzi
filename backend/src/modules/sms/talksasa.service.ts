import axios from "axios";
import { normalizePhone } from "../../lib/phone";
import { smsConfig } from "../settings/settings.service";

/**
 * Talk Sasa bulk SMS.
 *
 * Talk Sasa's v3 API is a straightforward JSON + Bearer-token affair, which is
 * why it replaces the form-encoded Africa's Talking integration here. The base
 * URL is a setting rather than a constant: bulk SMS resellers move their
 * endpoints more often than you'd like, and a hardcoded host means a redeploy
 * to fix a delivery outage.
 *
 * Sender IDs must be registered with Talk Sasa before they will deliver.
 * An unregistered sender is the single most common reason messages vanish
 * without an error, so the connection test reports the configured one back.
 */

export interface SmsSendResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  accepted: number;
  failed: number;
  raw?: unknown;
}

function baseUrl(configured: string): string {
  const url = (configured || "https://bulksms.talksasa.com/api/v3").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Talk Sasa expects msisdn without a leading +. `normalizePhone` already
 * returns 2547XXXXXXXX, which is the format they want.
 */
function recipientList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map(normalizePhone).filter(Boolean);
}

export async function sendViaTalkSasa(
  to: string | string[],
  message: string
): Promise<SmsSendResult> {
  const cfg = await smsConfig();
  const recipients = recipientList(to);

  if (!recipients.length)
    return { ok: false, accepted: 0, failed: 0, reason: "No valid recipients" };

  if (!cfg.enabled) {
    console.warn("[sms] SMS is switched off in settings — skipping", recipients.length);
    return {
      ok: false,
      skipped: true,
      accepted: 0,
      failed: recipients.length,
      reason: "SMS is switched off in Settings → SMS",
    };
  }

  if (!cfg.apiKey) {
    console.warn("[sms] Talk Sasa API token is not set — skipping", recipients.length);
    return {
      ok: false,
      skipped: true,
      accepted: 0,
      failed: recipients.length,
      reason: "Talk Sasa API token is not set",
    };
  }

  const url = `${baseUrl(cfg.baseUrl)}/sms/send`;

  try {
    const { data } = await axios.post(
      url,
      {
        // Comma-separated is accepted for bulk sends.
        recipient: recipients.join(","),
        sender_id: cfg.senderId,
        type: "plain",
        message,
      },
      {
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    // Talk Sasa answers with { status: "success" | "error", message, data }.
    const ok = String(data?.status ?? "").toLowerCase() === "success";
    return {
      ok,
      accepted: ok ? recipients.length : 0,
      failed: ok ? 0 : recipients.length,
      reason: ok ? undefined : data?.message ?? "Talk Sasa rejected the message",
      raw: data,
    };
  } catch (e: any) {
    const detail =
      e?.response?.data?.message ??
      e?.response?.data?.error ??
      e?.response?.statusText ??
      e?.message;
    console.error("[sms] Talk Sasa send failed:", detail);
    return {
      ok: false,
      accepted: 0,
      failed: recipients.length,
      reason: `Talk Sasa: ${detail ?? "unknown error"}`,
    };
  }
}

/** Credit balance — used by the Settings connection test. */
export async function talkSasaBalance(): Promise<{
  ok: boolean;
  balance?: string;
  error?: string;
}> {
  const cfg = await smsConfig();
  if (!cfg.apiKey) return { ok: false, error: "API token is not set" };

  try {
    const { data } = await axios.post(
      `${baseUrl(cfg.baseUrl)}/balance`,
      {},
      {
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          Accept: "application/json",
        },
        timeout: 20000,
      }
    );

    if (String(data?.status ?? "").toLowerCase() !== "success")
      return { ok: false, error: data?.message ?? "Talk Sasa rejected the request" };

    return {
      ok: true,
      balance: String(data?.data?.balance ?? data?.balance ?? "unknown"),
    };
  } catch (e: any) {
    return {
      ok: false,
      error:
        e?.response?.data?.message ??
        e?.response?.statusText ??
        e?.message ??
        "Could not reach Talk Sasa",
    };
  }
}

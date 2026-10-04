import { Resend } from "resend";
import { env } from "../../config/env";
import { getSetting } from "../settings/settings.service";

/**
 * Transactional email through Resend.
 *
 * Same failure philosophy as SMS: a missing API key logs and skips rather than
 * throwing, so a store that hasn't set up email yet still takes orders. Every
 * caller that matters runs through `background()`, so a Resend outage can never
 * fail a checkout or a status change.
 */

let client: Resend | null = null;
function resend(): Resend | null {
  if (!env.email.resendApiKey) return null;
  return (client ??= new Resend(env.email.resendApiKey));
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  /** Shows up in Resend's logs. Letters, numbers, _ and - only. */
  tag?: string;
  /** Resend drops a repeat send with the same key for 24h, so retries are safe. */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  reason?: string;
}

async function replyTo(): Promise<string | undefined> {
  if (env.email.replyTo) return env.email.replyTo;
  const fromSettings = (await getSetting("store.email").catch(() => "")).trim();
  return fromSettings || undefined;
}

export async function sendEmail(i: SendEmailInput): Promise<SendEmailResult> {
  const r = resend();
  if (!r) {
    console.warn(`[email] RESEND_API_KEY is not set — skipping "${i.subject}"`);
    return { ok: false, skipped: true, reason: "RESEND_API_KEY is not set" };
  }

  const { data, error } = await r.emails.send(
    {
      from: i.from ?? env.email.fromOrders,
      to: i.to,
      subject: i.subject,
      html: i.html,
      text: i.text,
      replyTo: await replyTo(),
      tags: i.tag ? [{ name: "type", value: i.tag }] : undefined,
    },
    i.idempotencyKey ? { idempotencyKey: i.idempotencyKey } : undefined
  );

  if (error) {
    console.error(`[email] Resend rejected "${i.subject}": ${error.name}: ${error.message}`);
    return { ok: false, reason: error.message };
  }
  return { ok: true, id: data?.id };
}

/** Fire-and-forget. A notification failure must never fail the request behind it. */
export function background(label: string, task: () => Promise<unknown>): void {
  task().catch((err) => console.error(`[notify] ${label} failed:`, err));
}

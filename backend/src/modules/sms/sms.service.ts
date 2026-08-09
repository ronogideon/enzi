import axios from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { normalizePhone } from "../../lib/phone";

// Africa's Talking messaging endpoint. Sandbox uses the "sandbox" username
// and a separate host. We hit the REST API directly (form-encoded) rather
// than pulling in the SDK, which drags in vulnerable transitive deps.
const AT_HOST =
  env.at.username === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";
const AT_URL = `${AT_HOST}/version1/messaging`;

export interface Segment {
  tags?: string[];
  lastOrderWithinDays?: number;
  hasOrdered?: boolean;
  marketingConsent?: boolean;
}

/** Turn a segment into a customer query. */
export async function resolveSegment(segment: Segment) {
  const where: Prisma.CustomerWhereInput = {
    marketingConsent: segment.marketingConsent ?? true,
  };
  if (segment.tags?.length) where.tags = { hasSome: segment.tags };
  if (segment.hasOrdered) where.orderCount = { gt: 0 };
  if (segment.lastOrderWithinDays) {
    const since = new Date();
    since.setDate(since.getDate() - segment.lastOrderWithinDays);
    where.lastOrderAt = { gte: since };
  }
  return prisma.customer.findMany({ where });
}

/** Send an SMS to one or more numbers via the AT REST API. */
export async function sendSms(to: string | string[], body: string) {
  const recipients = (Array.isArray(to) ? to : [to])
    .map(normalizePhone)
    .join(",");

  if (!env.at.apiKey || !env.at.username) {
    console.warn("[sms] AT not configured — skipping send to", recipients);
    return { skipped: true };
  }

  const params = new URLSearchParams({
    username: env.at.username,
    to: recipients,
    message: body,
  });
  if (env.at.senderId) params.set("from", env.at.senderId);

  const { data } = await axios.post(AT_URL, params.toString(), {
    headers: {
      apiKey: env.at.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
  });
  return data;
}

/**
 * Run a promotional campaign: resolve recipients, send, and log each message.
 * Sending is best-effort per recipient so one failure doesn't abort the batch.
 */
export async function runCampaign(campaignId: string) {
  const campaign = await prisma.smsCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw new Error("Campaign not found");

  const recipients = await resolveSegment((campaign.segment as Segment) ?? {});
  await prisma.smsCampaign.update({
    where: { id: campaignId },
    data: { status: "SENDING", recipients: recipients.length },
  });

  let sent = 0;
  let failed = 0;
  for (const c of recipients) {
    try {
      await sendSms(c.phone, campaign.body);
      await prisma.smsMessage.create({
        data: { campaignId, customerId: c.id, phone: c.phone, body: campaign.body, status: "SENT" },
      });
      sent++;
    } catch {
      await prisma.smsMessage.create({
        data: { campaignId, customerId: c.id, phone: c.phone, body: campaign.body, status: "FAILED" },
      });
      failed++;
    }
  }

  await prisma.smsCampaign.update({
    where: { id: campaignId },
    data: { status: failed && !sent ? "FAILED" : "SENT", sentAt: new Date() },
  });
  return { recipients: recipients.length, sent, failed };
}

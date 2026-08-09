import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { normalizePhone } from "../../lib/phone";

// africastalking has no bundled types; load lazily so the app still boots
// without the dependency configured (e.g. local dev without AT creds).
function atClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AfricasTalking = require("africastalking");
  return AfricasTalking({ apiKey: env.at.apiKey, username: env.at.username });
}

export interface Segment {
  tags?: string[]; // customer must have at least one of these tags
  lastOrderWithinDays?: number; // ordered within N days
  hasOrdered?: boolean; // orderCount > 0
  marketingConsent?: boolean; // default true
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

/** Send a single transactional SMS (order confirmations etc.). */
export async function sendSms(phone: string, body: string) {
  const to = normalizePhone(phone);
  if (!env.at.apiKey) {
    console.warn("[sms] AT not configured — skipping send to", to);
    return { skipped: true };
  }
  const sms = atClient().SMS;
  const res = await sms.send({ to: [to], message: body, from: env.at.senderId });
  return res;
}

/**
 * Run a promotional campaign: resolve recipients, send, and log each message.
 * Returns counts. Sending is best-effort per recipient.
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
        data: {
          campaignId,
          customerId: c.id,
          phone: c.phone,
          body: campaign.body,
          status: "SENT",
        },
      });
      sent++;
    } catch (e) {
      await prisma.smsMessage.create({
        data: {
          campaignId,
          customerId: c.id,
          phone: c.phone,
          body: campaign.body,
          status: "FAILED",
        },
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

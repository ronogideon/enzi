import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { sendViaTalkSasa } from "./talksasa.service";

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

/**
 * Send an SMS to one or more numbers.
 *
 * Delegates to Talk Sasa. Kept as a thin wrapper so campaigns, order
 * notifications and one-off sends all go through a single call site — swapping
 * providers again is one file, not a search across the codebase.
 */
export async function sendSms(to: string | string[], body: string) {
  const result = await sendViaTalkSasa(to, body);
  if (!result.ok && !result.skipped)
    console.error("[sms] send failed:", result.reason);
  return result;
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

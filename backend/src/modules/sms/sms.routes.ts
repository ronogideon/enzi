import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireStaff } from "../../middleware/auth";
import { sendSms, runCampaign, resolveSegment, Segment } from "./sms.service";

export const smsRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

const segmentSchema = z
  .object({
    tags: z.array(z.string()).optional(),
    lastOrderWithinDays: z.number().int().positive().optional(),
    hasOrdered: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
  })
  .default({});

// preview how many customers a segment hits (before spending credits)
smsRouter.post(
  "/segment/preview",
  requireStaff,
  wrap(async (req, res) => {
    const segment = segmentSchema.parse(req.body) as Segment;
    const recipients = await resolveSegment(segment);
    res.json({ count: recipients.length });
  })
);

// send an ad-hoc single SMS
smsRouter.post(
  "/send",
  requireStaff,
  wrap(async (req, res) => {
    const { phone, body } = z
      .object({ phone: z.string(), body: z.string().min(1) })
      .parse(req.body);
    res.json(await sendSms(phone, body));
  })
);

// create a campaign (draft)
smsRouter.post(
  "/campaigns",
  requireStaff,
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string(),
        body: z.string().min(1),
        segment: segmentSchema,
      })
      .parse(req.body);
    const campaign = await prisma.smsCampaign.create({
      data: {
        name: body.name,
        body: body.body,
        segment: body.segment,
        staffId: req.auth!.sub,
      },
    });
    res.status(201).json(campaign);
  })
);

// fire a campaign
smsRouter.post(
  "/campaigns/:id/run",
  requireStaff,
  wrap(async (req, res) => {
    res.json(await runCampaign(req.params.id));
  })
);

smsRouter.get(
  "/campaigns",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(
      await prisma.smsCampaign.findMany({ orderBy: { createdAt: "desc" } })
    );
  })
);

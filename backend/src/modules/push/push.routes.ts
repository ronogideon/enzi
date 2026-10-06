import { Router } from "express";
import { z } from "zod";
import { requireStaff } from "../../middleware/auth";
import { publicKey, pushToStaff, removeSubscription, saveSubscription } from "./push.service";

/** Mounted at /api/push. Staff only. */
export const pushRouter = Router();
pushRouter.use(requireStaff);

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

pushRouter.get(
  "/public-key",
  wrap(async (_req, res) => {
    res.json({ publicKey: await publicKey() });
  })
);

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

pushRouter.post(
  "/subscribe",
  wrap(async (req, res) => {
    const sub = subSchema.parse(req.body?.subscription);
    await saveSubscription(req.auth!.sub, sub, String(req.headers["user-agent"] ?? "").slice(0, 300));
    res.json({ ok: true });
  })
);

pushRouter.post(
  "/unsubscribe",
  wrap(async (req, res) => {
    const endpoint = z.string().max(2000).parse(req.body?.endpoint);
    await removeSubscription(req.auth!.sub, endpoint);
    res.json({ ok: true });
  })
);

/** "Send a test" button — proves the whole chain on this person's devices. */
pushRouter.post(
  "/test",
  wrap(async (req, res) => {
    const result = await pushToStaff(
      { staffId: req.auth!.sub },
      {
        title: "Order alerts are on",
        body: "You'll get a notification like this for every new order.",
        url: "/orders",
        tag: "test",
      }
    );
    res.json(result);
  })
);

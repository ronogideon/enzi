import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { verifyOrderSig } from "./tracking-links";
import { statusMeta } from "./order-status";
import { renderStatusPng } from "./status-image";

/**
 * Public, but every URL carries an HMAC signature, so nobody can walk the
 * sequential order numbers. Mounted at /api/track.
 */
export const trackingRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

/** The live image embedded in order emails. */
trackingRouter.get(
  "/:id/:sig/status.png",
  wrap(async (req, res) => {
    const { id, sig } = req.params;
    if (!verifyOrderSig(id, sig)) return res.status(404).end();

    const order = await prisma.order.findUnique({
      where: { id },
      select: { status: true, statusChangedAt: true, placedAt: true, createdAt: true },
    });
    if (!order) return res.status(404).end();

    const png = renderStatusPng(order.status, order.statusChangedAt ?? order.placedAt ?? order.createdAt);
    res.set({
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      // Re-fetched on every open, so an old email shows the current status.
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      // Webmail that loads images directly (Outlook.com, Yahoo) needs this if a
      // proxy ever adds a same-origin resource policy.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.send(png);
  })
);

/** What the storefront /track page shows. Deliberately no phone, email or address. */
trackingRouter.get(
  "/:id/:sig",
  wrap(async (req, res) => {
    const { id, sig } = req.params;
    if (!verifyOrderSig(id, sig)) return res.status(404).json({ error: "Not found" });

    const o = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { select: { name: true, variantLabel: true, quantity: true } },
        deliveryMethod: { select: { name: true } },
        deliveryZone: { select: { name: true } },
      },
    });
    if (!o) return res.status(404).json({ error: "Not found" });

    res.set("Cache-Control", "no-store");
    res.json({
      orderNumber: o.orderNumber,
      status: o.status,
      ...statusMeta(o.status),
      isPaid: o.isPaid,
      isPayOnDelivery: o.isPayOnDelivery,
      total: o.total,
      trackingRef: o.trackingRef,
      delivery: [o.deliveryMethod?.name, o.deliveryZone?.name].filter(Boolean).join(" — ") || null,
      placedAt: o.placedAt ?? o.createdAt,
      updatedAt: o.statusChangedAt ?? o.placedAt ?? o.createdAt,
      items: o.items,
    });
  })
);

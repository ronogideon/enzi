import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { requireStaff } from "../../middleware/auth";

export const stockRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

// ---- manual restock (adds to ledger) ----
stockRouter.post(
  "/restock",
  requireStaff,
  wrap(async (req, res) => {
    const { productId, quantity, note } = z
      .object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        note: z.string().optional(),
      })
      .parse(req.body);
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id: productId },
        data: { stockQty: { increment: quantity } },
      });
      await tx.stockMovement.create({
        data: { productId, delta: quantity, reason: "RESTOCK", note },
      });
      return p;
    });
    res.json(product);
  })
);

// ---- movement ledger for a product ----
stockRouter.get(
  "/movements/:productId",
  requireStaff,
  wrap(async (req, res) => {
    res.json(
      await prisma.stockMovement.findMany({
        where: { productId: req.params.productId },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    );
  })
);

// ---- open an audit: snapshots current system qty for all active products ----
stockRouter.post(
  "/audits",
  requireStaff,
  wrap(async (req, res) => {
    const note = req.body?.note as string | undefined;
    const reference = `AUD-${new Date().getFullYear()}-${Date.now()
      .toString(36)
      .toUpperCase()}`;
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, stockQty: true },
    });
    const audit = await prisma.stockAudit.create({
      data: {
        reference,
        staffId: req.auth!.sub,
        note,
        items: {
          create: products.map((p) => ({
            productId: p.id,
            systemQty: p.stockQty,
            countedQty: p.stockQty,
            variance: 0,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });
    res.status(201).json(audit);
  })
);

// ---- record a physical count for one line ----
stockRouter.patch(
  "/audits/:auditId/items/:itemId",
  requireStaff,
  wrap(async (req, res) => {
    const { countedQty } = z
      .object({ countedQty: z.number().int().nonnegative() })
      .parse(req.body);
    const item = await prisma.stockAuditItem.findUnique({
      where: { id: req.params.itemId },
    });
    if (!item) throw new HttpError(404, "Audit line not found");
    res.json(
      await prisma.stockAuditItem.update({
        where: { id: item.id },
        data: { countedQty, variance: countedQty - item.systemQty },
      })
    );
  })
);

// ---- close an audit: post variances to stock + ledger ----
stockRouter.post(
  "/audits/:auditId/close",
  requireStaff,
  wrap(async (req, res) => {
    const audit = await prisma.stockAudit.findUnique({
      where: { id: req.params.auditId },
      include: { items: true },
    });
    if (!audit) throw new HttpError(404, "Audit not found");
    if (audit.closedAt) throw new HttpError(400, "Audit already closed");

    await prisma.$transaction(async (tx) => {
      for (const item of audit.items) {
        if (item.variance !== 0 && !item.applied) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: item.countedQty },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              delta: item.variance,
              reason: "AUDIT_ADJUST",
              refId: audit.id,
            },
          });
          await tx.stockAuditItem.update({
            where: { id: item.id },
            data: { applied: true },
          });
        }
      }
      await tx.stockAudit.update({
        where: { id: audit.id },
        data: { closedAt: new Date() },
      });
    });

    res.json({ ok: true });
  })
);

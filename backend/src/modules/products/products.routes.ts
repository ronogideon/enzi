import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { requireStaff, requireRole } from "../../middleware/auth";
import { effectiveUnitPrice } from "../pricing/pricing.service";

export const productsRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Slugs are in URLs and must stay unique — suffix on collision. */
async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "product";
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const clash = await prisma.product.findUnique({ where: { slug: candidate } });
    if (!clash || clash.id === excludeId) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Accept an uploaded /api/media/<id> path or a full external URL. */
const imageSchema = z.object({
  url: z
    .string()
    .min(1)
    .refine((u) => u.startsWith("/api/media/") || /^https?:\/\//.test(u), {
      message: "must be an uploaded image or a full http(s) URL",
    }),
  alt: z.string().max(300).optional(),
  mediaId: z.string().optional(),
});

function extractMediaId(url: string): string | null {
  const m = /^\/api\/media\/([A-Za-z0-9_-]+)$/.exec(url);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- public read

productsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { category, featured, search, tier } = req.query as Record<string, string>;
    const where: any = { active: true };
    if (category) where.category = { slug: category };
    if (featured === "true") where.featured = true;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const products = await prisma.product.findMany({
      where,
      include: {
        images: { orderBy: { position: "asc" } },
        category: true,
        promotions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Both prices go out regardless of the requested tier: wholesale is applied
    // automatically by quantity, so the storefront needs to show the threshold
    // and the bulk rate on every card without asking who the buyer is.
    void tier;
    res.json(
      products.map((p) => ({
        ...p,
        effectivePrice: effectiveUnitPrice(p, "RETAIL", p.promotions),
        effectiveWholesalePrice:
          p.wholesalePrice == null
            ? null
            : effectiveUnitPrice(p, "WHOLESALE", p.promotions),
      }))
    );
  })
);

/**
 * Staff catalogue view — includes deactivated products, which the public list
 * hides. Registered before /:slug so "admin" isn't parsed as a slug.
 */
productsRouter.get(
  "/admin/all",
  requireStaff,
  wrap(async (req, res) => {
    const { search } = req.query as Record<string, string>;
    const products = await prisma.product.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
      include: {
        images: { orderBy: { position: "asc" } },
        category: true,
        promotions: true,
        _count: { select: { orderItems: true } },
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    res.json(products);
  })
);

productsRouter.get(
  "/featured",
  wrap(async (_req, res) => {
    const featured = await prisma.product.findMany({
      where: { active: true, featured: true },
      include: { images: { orderBy: { position: "asc" } } },
    });
    for (let i = featured.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [featured[i], featured[j]] = [featured[j], featured[i]];
    }
    res.json(featured.slice(0, 8));
  })
);

productsRouter.get(
  "/:slug",
  wrap(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { slug: req.params.slug },
      include: {
        images: { orderBy: { position: "asc" } },
        category: true,
        promotions: true,
      },
    });
    if (!product || !product.active) throw new HttpError(404, "Product not found");
    res.json(product);
  })
);

// --------------------------------------------------------------- staff write

const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  retailPrice: z.number().int().nonnegative(),
  wholesalePrice: z.number().int().nonnegative().optional().nullable(),
  retailMinQty: z.number().int().positive().default(1),
  wholesaleMinQty: z.number().int().positive().default(1),
  stockQty: z.number().int().default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sku: z.string().optional().nullable(),
  images: z.array(imageSchema).max(12).optional(),
});

productsRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = upsertSchema.parse(req.body);
    const { images, ...rest } = data;

    const product = await prisma.product.create({
      data: {
        ...rest,
        categoryId: rest.categoryId || null,
        sku: rest.sku || null,
        slug: await uniqueSlug(data.name),
        images: images?.length
          ? {
              create: images.map((im, i) => ({
                url: im.url,
                alt: im.alt ?? null,
                mediaId: im.mediaId ?? extractMediaId(im.url),
                position: i,
              })),
            }
          : undefined,
      },
      include: { images: { orderBy: { position: "asc" } }, category: true },
    });
    res.status(201).json(product);
  })
);

/**
 * Update. When `images` is present it replaces the whole set — the admin form
 * always sends the full ordered list, so add / remove / reorder are all just
 * "here is the new list". Omitting the key leaves photos untouched, which is
 * what the inline featured/active toggles on the product table rely on.
 */
productsRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = upsertSchema.partial().parse(req.body);
    const { images, ...rest } = data;

    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Product not found");

    const newSlug =
      rest.name && rest.name !== existing.name
        ? await uniqueSlug(rest.name, existing.id)
        : undefined;

    const product = await prisma.$transaction(async (tx) => {
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: existing.id } });
        if (images.length) {
          await tx.productImage.createMany({
            data: images.map((im, i) => ({
              productId: existing.id,
              url: im.url,
              alt: im.alt ?? null,
              mediaId: im.mediaId ?? extractMediaId(im.url),
              position: i,
            })),
          });
        }
      }

      return tx.product.update({
        where: { id: existing.id },
        data: {
          ...rest,
          categoryId: rest.categoryId === undefined ? undefined : rest.categoryId || null,
          sku: rest.sku === undefined ? undefined : rest.sku || null,
          slug: newSlug,
        },
        include: { images: { orderBy: { position: "asc" } }, category: true },
      });
    });

    res.json(product);
  })
);

/**
 * Delete. Default is a soft delete (hide from the shop), because a product
 * referenced by past orders can't be removed without destroying order history.
 * `?hard=true` permanently removes a product that has never been ordered.
 */
productsRouter.delete(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const hard = String(req.query.hard) === "true";
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!product) throw new HttpError(404, "Product not found");

    if (!hard) {
      await prisma.product.update({ where: { id: product.id }, data: { active: false } });
      return res.json({ ok: true, hidden: true });
    }

    if (product._count.orderItems > 0)
      throw new HttpError(
        409,
        `"${product.name}" appears on ${product._count.orderItems} order line(s) and can't be permanently deleted. Hide it instead — it disappears from the shop but order history stays intact.`
      );

    const imageIds = (
      await prisma.productImage.findMany({
        where: { productId: product.id, mediaId: { not: null } },
        select: { mediaId: true },
      })
    )
      .map((i) => i.mediaId!)
      .filter(Boolean);

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: product.id } });
      await tx.stockAuditItem.deleteMany({ where: { productId: product.id } });
      await tx.promotion.deleteMany({ where: { productId: product.id } });
      await tx.product.delete({ where: { id: product.id } });
      if (imageIds.length)
        await tx.mediaAsset.deleteMany({ where: { id: { in: imageIds } } });
    });

    res.json({ ok: true, deleted: true });
  })
);

/** Bring a hidden product back into the shop. */
productsRouter.post(
  "/:id/restore",
  requireStaff,
  wrap(async (req, res) => {
    res.json(
      await prisma.product.update({
        where: { id: req.params.id },
        data: { active: true },
        include: { images: { orderBy: { position: "asc" } }, category: true },
      })
    );
  })
);

/** Duplicate a product — faster than retyping a near-identical variant. */
productsRouter.post(
  "/:id/duplicate",
  requireRole("SUPERADMIN", "ADMIN", "STAFF"),
  wrap(async (req, res) => {
    const source = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!source) throw new HttpError(404, "Product not found");

    const name = `${source.name} (copy)`;
    const copy = await prisma.product.create({
      data: {
        name,
        slug: await uniqueSlug(name),
        description: source.description,
        categoryId: source.categoryId,
        retailPrice: source.retailPrice,
        wholesalePrice: source.wholesalePrice,
        retailMinQty: source.retailMinQty,
        wholesaleMinQty: source.wholesaleMinQty,
        stockQty: 0,
        featured: false,
        active: false, // land as a draft so a half-filled copy never hits the shop
        images: {
          create: source.images.map((im, i) => ({
            url: im.url,
            alt: im.alt,
            mediaId: im.mediaId,
            position: i,
          })),
        },
      },
      include: { images: { orderBy: { position: "asc" } }, category: true },
    });
    res.status(201).json(copy);
  })
);

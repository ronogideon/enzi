import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { requireStaff } from "../../middleware/auth";
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

// ---- public: list ----
productsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { category, featured, search, tier } = req.query as Record<
      string,
      string
    >;
    const where: any = { active: true };
    if (category) where.category = { slug: category };
    if (featured === "true") where.featured = true;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const products = await prisma.product.findMany({
      where,
      include: { images: true, category: true, promotions: true },
      orderBy: { createdAt: "desc" },
    });

    const t = tier === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
    res.json(
      products.map((p) => ({
        ...p,
        effectivePrice: effectiveUnitPrice(p, t, p.promotions),
      }))
    );
  })
);

// ---- public: featured (randomised) ----
productsRouter.get(
  "/featured",
  wrap(async (_req, res) => {
    const featured = await prisma.product.findMany({
      where: { active: true, featured: true },
      include: { images: true },
    });
    // shuffle so the section varies on refresh
    for (let i = featured.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [featured[i], featured[j]] = [featured[j], featured[i]];
    }
    res.json(featured.slice(0, 8));
  })
);

// ---- public: single ----
productsRouter.get(
  "/:slug",
  wrap(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { slug: req.params.slug },
      include: { images: true, category: true, promotions: true },
    });
    if (!product || !product.active)
      throw new HttpError(404, "Product not found");
    res.json(product);
  })
);

// ---- staff: create ----
const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  retailPrice: z.number().int().nonnegative(),
  wholesalePrice: z.number().int().nonnegative().optional(),
  retailMinQty: z.number().int().positive().default(1),
  wholesaleMinQty: z.number().int().positive().default(1),
  stockQty: z.number().int().default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sku: z.string().optional(),
  images: z
    .array(z.object({ url: z.string().url(), alt: z.string().optional() }))
    .optional(),
});

productsRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = upsertSchema.parse(req.body);
    const product = await prisma.product.create({
      data: {
        ...data,
        slug: slugify(data.name) + "-" + Date.now().toString(36),
        images: data.images
          ? { create: data.images.map((im, i) => ({ ...im, position: i })) }
          : undefined,
      },
      include: { images: true },
    });
    res.status(201).json(product);
  })
);

// ---- staff: update ----
productsRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = upsertSchema.partial().parse(req.body);
    const { images, ...rest } = data;
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: rest,
      include: { images: true },
    });
    res.json(product);
  })
);

productsRouter.delete(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ ok: true });
  })
);

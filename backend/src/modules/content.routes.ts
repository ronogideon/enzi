import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireStaff, requireRole } from "../middleware/auth";

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---------------------------------------------------------------- categories
export const categoriesRouter = Router();
categoriesRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json(
      await prisma.category.findMany({
        where: { active: true },
        orderBy: { position: "asc" },
        include: { _count: { select: { products: true } } },
      })
    );
  })
);
categoriesRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const { name, position } = z
      .object({ name: z.string(), position: z.number().int().default(0) })
      .parse(req.body);
    res.status(201).json(
      await prisma.category.create({
        data: { name, slug: slugify(name), position },
      })
    );
  })
);
categoriesRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        position: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(
      await prisma.category.update({ where: { id: req.params.id }, data })
    );
  })
);

// ----------------------------------------------------------- delivery methods
export const deliveryRouter = Router();
deliveryRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json(
      await prisma.deliveryMethod.findMany({
        where: { active: true },
        orderBy: { position: "asc" },
      })
    );
  })
);
deliveryRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(["STORE_PICKUP", "DELIVERY", "PARCEL", "PICKUP_MTAANI"]),
        description: z.string().optional(),
        baseCost: z.number().int().nonnegative().default(0),
        podAllowed: z.boolean().default(false),
        position: z.number().int().default(0),
        config: z.any().optional(),
      })
      .parse(req.body);
    // enforce the rule: parcel + mtaani are never POD
    if (data.type === "PARCEL" || data.type === "PICKUP_MTAANI")
      data.podAllowed = false;
    res.status(201).json(await prisma.deliveryMethod.create({ data }));
  })
);
deliveryRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        baseCost: z.number().int().nonnegative().optional(),
        podAllowed: z.boolean().optional(),
        active: z.boolean().optional(),
        position: z.number().int().optional(),
        config: z.any().optional(),
      })
      .parse(req.body);
    const method = await prisma.deliveryMethod.findUnique({
      where: { id: req.params.id },
    });
    if (
      method &&
      (method.type === "PARCEL" || method.type === "PICKUP_MTAANI")
    )
      data.podAllowed = false;
    res.json(
      await prisma.deliveryMethod.update({ where: { id: req.params.id }, data })
    );
  })
);

// -------------------------------------------------------------- promotions
export const promotionsRouter = Router();
promotionsRouter.get(
  "/",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(
      await prisma.promotion.findMany({ orderBy: { createdAt: "desc" } })
    );
  })
);
promotionsRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(["PERCENT", "FIXED_PRICE", "FIXED_DISCOUNT"]),
        value: z.number().int(),
        tier: z.enum(["RETAIL", "WHOLESALE"]).optional(),
        productId: z.string().optional(),
        categoryId: z.string().optional(),
        startsAt: z.coerce.date().optional(),
        endsAt: z.coerce.date().optional(),
      })
      .parse(req.body);
    res.status(201).json(await prisma.promotion.create({ data }));
  })
);
promotionsRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({ active: z.boolean().optional(), value: z.number().int().optional() })
      .parse(req.body);
    res.json(
      await prisma.promotion.update({ where: { id: req.params.id }, data })
    );
  })
);

// --------------------------------------------------------------- customers
export const customersRouter = Router();
customersRouter.get(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const { search } = req.query as Record<string, string>;
    res.json(
      await prisma.customer.findMany({
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            }
          : undefined,
        orderBy: { lastOrderAt: "desc" },
        take: 100,
      })
    );
  })
);
customersRouter.get(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    res.json(
      await prisma.customer.findUnique({
        where: { id: req.params.id },
        include: {
          orders: { orderBy: { createdAt: "desc" }, take: 20 },
          addresses: true,
        },
      })
    );
  })
);
customersRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
        marketingConsent: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(
      await prisma.customer.update({ where: { id: req.params.id }, data })
    );
  })
);

// ----------------------------------------------------------------- reviews
export const reviewsRouter = Router();
reviewsRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json(
      await prisma.review.findMany({
        where: { approved: true },
        orderBy: { createdAt: "desc" },
      })
    );
  })
);
reviewsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = z
      .object({
        authorName: z.string(),
        rating: z.number().int().min(1).max(5),
        body: z.string().min(1),
      })
      .parse(req.body);
    res.status(201).json(await prisma.review.create({ data }));
  })
);
reviewsRouter.post(
  "/:id/approve",
  requireStaff,
  wrap(async (req, res) => {
    res.json(
      await prisma.review.update({
        where: { id: req.params.id },
        data: { approved: true, verified: true },
      })
    );
  })
);

// -------------------------------------------------------------------- blog
export const blogRouter = Router();
blogRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json(
      await prisma.blogPost.findMany({
        where: { published: true },
        orderBy: { publishedAt: "desc" },
      })
    );
  })
);
blogRouter.get(
  "/:slug",
  wrap(async (req, res) => {
    const post = await prisma.blogPost.findUnique({
      where: { slug: req.params.slug },
    });
    if (!post || !post.published)
      return res.status(404).json({ error: "Not found" });
    res.json(post);
  })
);
blogRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        title: z.string(),
        excerpt: z.string().optional(),
        body: z.string(),
        coverImage: z.string().optional(),
        published: z.boolean().default(false),
      })
      .parse(req.body);
    res.status(201).json(
      await prisma.blogPost.create({
        data: {
          ...data,
          slug: slugify(data.title),
          publishedAt: data.published ? new Date() : null,
        },
      })
    );
  })
);

// --------------------------------------------------------------------- faq
export const faqRouter = Router();
faqRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json(
      await prisma.faq.findMany({
        where: { active: true },
        orderBy: { position: "asc" },
      })
    );
  })
);
faqRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        question: z.string(),
        answer: z.string(),
        position: z.number().int().default(0),
      })
      .parse(req.body);
    res.status(201).json(await prisma.faq.create({ data }));
  })
);

// ---------------------------------------------------------------- settings
export const settingsRouter = Router();
settingsRouter.get(
  "/",
  requireStaff,
  wrap(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  })
);
settingsRouter.put(
  "/:key",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const { value } = z.object({ value: z.any() }).parse(req.body);
    const row = await prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value },
    });
    res.json(row);
  })
);

import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/error";
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

/**
 * The CRM the shop actually runs on. Every checkout upserts a customer by
 * phone, so this list fills itself whether or not the buyer registered an
 * account. Staff-only — none of this is reachable from the storefront.
 */
customersRouter.get(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const { search, tag, hasAccount, take } = req.query as Record<string, string>;

    const where: Prisma.CustomerWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search.replace(/[^0-9]/g, "") || search } },
      ];
    }
    if (tag) where.tags = { has: tag };
    if (hasAccount === "true") where.passwordHash = { not: null };

    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        tags: true,
        notes: true,
        marketingConsent: true,
        orderCount: true,
        totalSpent: true,
        lastOrderAt: true,
        lastLoginAt: true,
        createdAt: true,
        // Never select passwordHash — expose only whether one exists.
        _count: { select: { orders: true } },
      },
      orderBy: [{ lastOrderAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(parseInt(take ?? "200", 10) || 200, 500),
    });

    // Flag account-holders without ever shipping the hash.
    const withLogin = await prisma.customer.findMany({
      where: { id: { in: customers.map((c) => c.id) }, passwordHash: { not: null } },
      select: { id: true },
    });
    const loginSet = new Set(withLogin.map((c) => c.id));

    res.json(customers.map((c) => ({ ...c, hasAccount: loginSet.has(c.id) })));
  })
);

/** CSV export — the "I need to reach my customers" button. */
customersRouter.get(
  "/export.csv",
  requireRole("SUPERADMIN", "ADMIN", "SUPPORT"),
  wrap(async (_req, res) => {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        phone: true,
        email: true,
        tags: true,
        orderCount: true,
        totalSpent: true,
        lastOrderAt: true,
        marketingConsent: true,
        createdAt: true,
      },
    });

    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Name", "Phone", "Email", "Tags", "Orders",
      "Total spent (KES)", "Last order", "Marketing consent", "Joined",
    ];
    const rows = customers.map((c) =>
      [
        c.name ?? "",
        c.phone,
        c.email ?? "",
        c.tags.join("|"),
        c.orderCount,
        (c.totalSpent / 100).toFixed(2),
        c.lastOrderAt ? c.lastOrderAt.toISOString().slice(0, 10) : "",
        c.marketingConsent ? "yes" : "no",
        c.createdAt.toISOString().slice(0, 10),
      ].map(esc).join(",")
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="enzi-customers-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send([header.join(","), ...rows].join("\n"));
  })
);

customersRouter.get(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, phone: true, name: true, email: true, tags: true, notes: true,
        marketingConsent: true, orderCount: true, totalSpent: true,
        lastOrderAt: true, lastLoginAt: true, createdAt: true,
        addresses: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { items: true, deliveryMethod: true },
        },
      },
    });
    if (!customer) throw new HttpError(404, "Customer not found");
    res.json(customer);
  })
);

customersRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        tags: z.array(z.string()).optional(),
        notes: z.string().max(4000).optional(),
        marketingConsent: z.boolean().optional(),
      })
      .parse(req.body);

    res.json(
      await prisma.customer.update({
        where: { id: req.params.id },
        data: {
          name: data.name,
          email: data.email === "" ? null : data.email,
          tags: data.tags,
          notes: data.notes,
          marketingConsent: data.marketingConsent,
        },
        select: {
          id: true, phone: true, name: true, email: true, tags: true, notes: true,
          marketingConsent: true, orderCount: true, totalSpent: true,
          lastOrderAt: true, createdAt: true,
        },
      })
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

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

/** Slugs live in URLs, so they must stay unique across drafts and published. */
async function uniqueBlogSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || "post";
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const clash = await prisma.blogPost.findUnique({ where: { slug: candidate } });
    if (!clash || clash.id === excludeId) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Public: published posts only. */
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

/** Staff: everything, drafts included. Before /:slug so it isn't read as one. */
blogRouter.get(
  "/admin/all",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(
      await prisma.blogPost.findMany({ orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] })
    );
  })
);

/** Staff: fetch one by id for editing, published or not. */
blogRouter.get(
  "/admin/:id",
  requireStaff,
  wrap(async (req, res) => {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw new HttpError(404, "Post not found");
    res.json(post);
  })
);

blogRouter.get(
  "/:slug",
  wrap(async (req, res) => {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
    if (!post || !post.published) return res.status(404).json({ error: "Not found" });
    res.json(post);
  })
);

const blogSchema = z.object({
  title: z.string().min(2),
  excerpt: z.string().max(400).optional().nullable(),
  // Markdown, not HTML: the storefront renders a fixed subset, so a post can
  // never inject script or arbitrary markup into the shop.
  body: z.string().min(1),
  coverImage: z.string().optional().nullable(),
  published: z.boolean().default(false),
});

blogRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = blogSchema.parse(req.body);
    res.status(201).json(
      await prisma.blogPost.create({
        data: {
          title: data.title.trim(),
          excerpt: data.excerpt || null,
          body: data.body,
          coverImage: data.coverImage || null,
          published: data.published,
          slug: await uniqueBlogSlug(data.title),
          publishedAt: data.published ? new Date() : null,
        },
      })
    );
  })
);

blogRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = blogSchema.partial().parse(req.body);
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Post not found");

    // publishedAt is the first time it went live, and stays put on later edits
    // so the blog doesn't reshuffle every time someone fixes a typo.
    const goingLive = data.published === true && !existing.published;

    res.json(
      await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          title: data.title?.trim(),
          excerpt: data.excerpt === undefined ? undefined : data.excerpt || null,
          body: data.body,
          coverImage: data.coverImage === undefined ? undefined : data.coverImage || null,
          published: data.published,
          slug:
            data.title && data.title.trim() !== existing.title
              ? await uniqueBlogSlug(data.title, existing.id)
              : undefined,
          publishedAt: goingLive ? existing.publishedAt ?? new Date() : undefined,
        },
      })
    );
  })
);

blogRouter.delete(
  "/:id",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw new HttpError(404, "Post not found");

    // Free any uploaded images the post owned and nothing else references.
    const mediaIds = [...post.body.matchAll(/\/api\/media\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    if (post.coverImage) {
      const m = /\/api\/media\/([A-Za-z0-9_-]+)/.exec(post.coverImage);
      if (m) mediaIds.push(m[1]);
    }

    await prisma.blogPost.delete({ where: { id: post.id } });

    if (mediaIds.length) {
      const stillUsed = await prisma.productImage.findMany({
        where: { mediaId: { in: mediaIds } },
        select: { mediaId: true },
      });
      const keep = new Set(stillUsed.map((i) => i.mediaId));
      const removable = mediaIds.filter((id) => !keep.has(id));
      if (removable.length)
        await prisma.mediaAsset.deleteMany({ where: { id: { in: removable } } });
    }

    res.json({ ok: true });
  })
);

// --------------------------------------------------------------------- faq
export const faqRouter = Router();

/** Public: active questions, in the order the shop arranged them. */
faqRouter.get(
  "/",
  wrap(async (_req, res) => {
    res.json(
      await prisma.faq.findMany({ where: { active: true }, orderBy: { position: "asc" } })
    );
  })
);

/** Staff: includes hidden entries. */
faqRouter.get(
  "/admin/all",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(await prisma.faq.findMany({ orderBy: { position: "asc" } }));
  })
);

faqRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        question: z.string().min(3),
        answer: z.string().min(1),
        active: z.boolean().default(true),
      })
      .parse(req.body);

    // New questions go to the end rather than colliding on position 0.
    const last = await prisma.faq.findFirst({ orderBy: { position: "desc" } });
    res.status(201).json(
      await prisma.faq.create({
        data: {
          question: data.question.trim(),
          answer: data.answer,
          active: data.active,
          position: (last?.position ?? -1) + 1,
        },
      })
    );
  })
);

faqRouter.patch(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const data = z
      .object({
        question: z.string().min(3).optional(),
        answer: z.string().min(1).optional(),
        active: z.boolean().optional(),
        position: z.number().int().optional(),
      })
      .parse(req.body);

    res.json(
      await prisma.faq.update({
        where: { id: req.params.id },
        data: { ...data, question: data.question?.trim() },
      })
    );
  })
);

/** Persist a whole new order in one call, so drag/reorder is atomic. */
faqRouter.post(
  "/reorder",
  requireStaff,
  wrap(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.faq.update({ where: { id }, data: { position: index } })
      )
    );
    res.json({ ok: true });
  })
);

faqRouter.delete(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    await prisma.faq.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

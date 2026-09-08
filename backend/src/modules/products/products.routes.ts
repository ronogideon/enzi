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

/**
 * Shape a product for public consumption.
 *
 * Exact stock counts never leave the API: the storefront only needs to know
 * whether something can be bought. That keeps a competitor from reading your
 * inventory, and it means the urgency badge is the shop's own words rather than
 * a number that might contradict them.
 */
/**
 * Sibling colour listings, shaped for the colour switcher. Each is a real
 * product with its own page, so the switcher can either swap in place or
 * navigate — and each carries its own availability.
 */
function publicSiblings(siblings: any[]) {
  return siblings.map((s: any) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    colourName: s.colourName,
    colourHex: s.colourHex,
    swatchMediaId: s.swatchMediaId,
    groupPosition: s.groupPosition,
    // Each sibling is a product in its own right and may be priced
    // differently. Without these the storefront fell back to the listing the
    // page was rendered from, so switching colour on a product with no size
    // variants could show — and add to cart — the wrong price.
    hasVariants: s.hasVariants,
    retailPrice: s.retailPrice,
    wholesalePrice: s.wholesalePrice,
    retailMinQty: s.retailMinQty,
    wholesaleMinQty: s.wholesaleMinQty,
    effectivePrice: effectiveUnitPrice(s, "RETAIL", s.promotions ?? []),
    effectiveWholesalePrice:
      s.wholesalePrice == null
        ? null
        : effectiveUnitPrice(s, "WHOLESALE", s.promotions ?? []),
    images: (s.images ?? []).map((im: any) => ({
      id: im.id,
      url: im.url,
      alt: im.alt,
    })),
    variants: (s.variants ?? [])
      .filter((v: any) => v.active)
      .map((v: any) => ({
        id: v.id,
        colour: v.colour,
        size: v.size,
        retailPrice: v.retailPrice,
        wholesalePrice: v.wholesalePrice,
        position: v.position,
        inStock: v.stockQty > 0,
      })),
    inStock: s.hasVariants
      ? (s.variants ?? []).some((v: any) => v.active && v.stockQty > 0)
      : s.stockQty > 0,
  }));
}

function publicProduct(p: any) {
  const variants = (p.variants ?? []).map((v: any) => ({
    id: v.id,
    colour: v.colour,
    size: v.size,
    colourHex: v.colourHex,
    swatchMediaId: v.swatchMediaId,
    slug: v.slug,
    retailPrice: v.retailPrice,
    wholesalePrice: v.wholesalePrice,
    position: v.position,
    inStock: v.stockQty > 0,
  }));

  const inStock = p.hasVariants
    ? variants.some((v: any) => v.inStock)
    : p.stockQty > 0;

  const { stockQty, siblings, ...rest } = p;
  return {
    ...rest,
    variants,
    inStock,
    colourOptions: siblings ? publicSiblings(siblings) : undefined,
    effectivePrice: effectiveUnitPrice(p, "RETAIL", p.promotions ?? []),
    effectiveWholesalePrice:
      p.wholesalePrice == null ? null : effectiveUnitPrice(p, "WHOLESALE", p.promotions ?? []),
  };
}

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
        variants: { where: { active: true }, orderBy: { position: "asc" } },
        category: true,
        promotions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Both prices go out regardless of the requested tier: wholesale is applied
    // automatically by quantity, so the storefront needs to show the threshold
    // and the bulk rate on every card without asking who the buyer is.
    void tier;
    res.json(products.map((p) => publicProduct(p)));
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
        variants: { orderBy: { position: "asc" } },
        category: true,
        promotions: true,
        _count: { select: { orderItems: true } },
      },
      orderBy: [{ active: "desc" }, { groupId: "asc" }, { groupPosition: "asc" }, { createdAt: "desc" }],
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
        variants: { where: { active: true }, orderBy: { position: "asc" } },
        category: true,
        promotions: true,
      },
    });
    if (!product || !product.active) throw new HttpError(404, "Product not found");

    // Colour siblings, if this listing belongs to a group. Fetched here rather
    // than through a Prisma self-relation so a product with no siblings costs
    // no extra query.
    const siblings = product.groupId
      ? await prisma.product.findMany({
          where: { groupId: product.groupId, active: true },
          include: {
            images: { orderBy: { position: "asc" } },
            variants: { where: { active: true }, orderBy: { position: "asc" } },
            promotions: true,
          },
          orderBy: [{ groupPosition: "asc" }, { createdAt: "asc" }],
        })
      : [];

    res.json(publicProduct({ ...product, siblings }));
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
  hasVariants: z.boolean().optional(),
  badgeText: z.string().max(60).optional().nullable(),
  badgeActive: z.boolean().optional(),
});

/** A colour/size combination with its own price, stock and optional swatch. */
const variantSchema = z.object({
  id: z.string().optional(),
  colour: z.string().max(60).optional().nullable(),
  size: z.string().max(60).optional().nullable(),
  colourHex: z.string().max(9).optional().nullable(),
  swatchMediaId: z.string().optional().nullable(),
  sku: z.string().max(60).optional().nullable(),
  retailPrice: z.number().int().nonnegative(),
  wholesalePrice: z.number().int().nonnegative().optional().nullable(),
  stockQty: z.number().int().default(0),
  active: z.boolean().default(true),
  position: z.number().int().optional(),
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

/**
 * Turn a product into a colour group, creating one sibling listing per colour.
 *
 * Everything is copied from the original — description, category, prices, min
 * quantities, size variants, badge — EXCEPT the images, because the whole point
 * of separate listings is that each colour shows its own photos. The shop
 * uploads those per listing afterwards.
 *
 * The original becomes the first colour rather than a hidden parent, so there's
 * no phantom product in the catalogue that nobody can buy.
 */
productsRouter.post(
  "/:id/colours",
  requireStaff,
  wrap(async (req, res) => {
    const { colours } = z
      .object({
        colours: z
          .array(
            z.object({
              name: z.string().min(1).max(60),
              colourHex: z.string().max(9).optional().nullable(),
              swatchMediaId: z.string().optional().nullable(),
            })
          )
          .min(1)
          .max(30),
      })
      .parse(req.body);

    const source = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    if (!source) throw new HttpError(404, "Product not found");

    const groupId = source.groupId ?? source.id;

    // Which colours already have a listing in this group — so running this
    // again after adding a colour only creates the new one.
    const existing = await prisma.product.findMany({
      where: { groupId },
      select: { colourName: true },
    });
    const taken = new Set(
      existing.map((e) => (e.colourName ?? "").toLowerCase()).filter(Boolean)
    );

    const created: string[] = [];

    await prisma.$transaction(async (tx) => {
      // The original joins the group as its first colour.
      const first = colours[0];
      await tx.product.update({
        where: { id: source.id },
        data: {
          groupId,
          colourName: source.colourName ?? first.name.trim(),
          colourHex: source.colourHex ?? first.colourHex ?? null,
          swatchMediaId: source.swatchMediaId ?? first.swatchMediaId ?? null,
          groupPosition: source.groupPosition ?? 0,
        },
      });
      if (!source.colourName) taken.add(first.name.trim().toLowerCase());

      for (const [i, colour] of colours.entries()) {
        const name = colour.name.trim();
        if (taken.has(name.toLowerCase())) continue;

        const listingName = `${stripColour(source.name)} — ${name}`;
        const sibling = await tx.product.create({
          data: {
            name: listingName,
            slug: await uniqueSlug(listingName),
            description: source.description,
            categoryId: source.categoryId,
            retailPrice: source.retailPrice,
            wholesalePrice: source.wholesalePrice,
            retailMinQty: source.retailMinQty,
            wholesaleMinQty: source.wholesaleMinQty,
            featured: false,
            // Starts hidden: a listing with no photos of its own shouldn't be
            // in the shop until someone has uploaded them.
            active: false,
            hasVariants: source.hasVariants,
            badgeText: source.badgeText,
            badgeActive: source.badgeActive,
            groupId,
            colourName: name,
            colourHex: colour.colourHex ?? null,
            swatchMediaId: colour.swatchMediaId ?? null,
            groupPosition: i,
            stockQty: 0,
          },
        });

        // Copy the size variants so pricing is identical from the start; stock
        // begins at zero because it hasn't been counted for this colour yet.
        for (const v of source.variants) {
          await tx.productVariant.create({
            data: {
              productId: sibling.id,
              colour: name,
              size: v.size,
              retailPrice: v.retailPrice,
              wholesalePrice: v.wholesalePrice,
              stockQty: 0,
              active: v.active,
              position: v.position,
              slug: null,
            },
          });
        }

        created.push(listingName);
      }
    });

    const group = await prisma.product.findMany({
      where: { groupId },
      include: { images: { orderBy: { position: "asc" } }, variants: true, category: true },
      orderBy: [{ groupPosition: "asc" }, { createdAt: "asc" }],
    });

    res.status(201).json({ groupId, created, products: group });
  })
);

/** Strip a trailing "— Colour" so regenerating doesn't stack suffixes. */
function stripColour(name: string) {
  return name.split(" — ")[0].trim();
}

/** Detach a listing from its colour group. */
productsRouter.post(
  "/:id/ungroup",
  requireStaff,
  wrap(async (req, res) => {
    res.json(
      await prisma.product.update({
        where: { id: req.params.id },
        data: { groupId: null, colourName: null, colourHex: null, swatchMediaId: null },
      })
    );
  })
);

// ------------------------------------------------------------------ variants

function variantSlug(productSlug: string, colour?: string | null, size?: string | null) {
  const part = [colour, size]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return part ? `${productSlug}-${part}` : null;
}

/**
 * Replace a product's whole variant set in one call.
 *
 * Sent as the full list, like images: the admin grid always knows the complete
 * intended state, and diffing on the server keeps ids (and therefore order
 * history) stable for variants that already existed.
 */
productsRouter.put(
  "/:id/variants",
  requireStaff,
  wrap(async (req, res) => {
    const { variants } = z
      .object({ variants: z.array(variantSchema).max(200) })
      .parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    if (!product) throw new HttpError(404, "Product not found");

    // Guard the combination being unique — two "White / 8*10cm" rows would be
    // ambiguous at checkout.
    const seen = new Set<string>();
    for (const v of variants) {
      const key = `${(v.colour ?? "").toLowerCase()}::${(v.size ?? "").toLowerCase()}`;
      if (seen.has(key))
        throw new HttpError(
          400,
          `Duplicate option: ${[v.colour, v.size].filter(Boolean).join(" / ") || "(blank)"}`
        );
      seen.add(key);
    }

    const keepIds = variants.map((v) => v.id).filter(Boolean) as string[];

    await prisma.$transaction(async (tx) => {
      // Variants that were removed: deactivate if they carry order history,
      // delete outright otherwise — the same rule products follow.
      const removed = product.variants.filter((v: any) => !keepIds.includes(v.id));
      for (const r of removed) {
        const used = await tx.orderItem.count({ where: { variantId: r.id } });
        if (used > 0)
          await tx.productVariant.update({ where: { id: r.id }, data: { active: false } });
        else await tx.productVariant.delete({ where: { id: r.id } });
      }

      for (const [i, v] of variants.entries()) {
        const data = {
          colour: v.colour?.trim() || null,
          size: v.size?.trim() || null,
          colourHex: v.colourHex?.trim() || null,
          swatchMediaId: v.swatchMediaId || null,
          sku: v.sku?.trim() || null,
          retailPrice: v.retailPrice,
          wholesalePrice: v.wholesalePrice ?? null,
          stockQty: v.stockQty,
          active: v.active,
          position: v.position ?? i,
          slug: variantSlug(product.slug, v.colour, v.size),
        };
        if (v.id) await tx.productVariant.update({ where: { id: v.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId: product.id } });
      }

      /**
       * Keep the product's headline price in step with its sizes.
       *
       * The listing card shows "from X", and a cart line without a size falls
       * back to this, so leaving it at whatever was typed months ago would
       * quietly misprice things. Derived from the cheapest active size.
       */
      const priced = variants.filter((v) => v.active);
      const retail = priced.length ? Math.min(...priced.map((v) => v.retailPrice)) : undefined;
      const wholesaleValues = priced
        .map((v) => v.wholesalePrice)
        .filter((p): p is number => p != null);
      const wholesale = wholesaleValues.length ? Math.min(...wholesaleValues) : null;

      await tx.product.update({
        where: { id: product.id },
        data: {
          hasVariants: variants.length > 0,
          ...(retail != null ? { retailPrice: retail } : {}),
          // Only clear it when there are sizes and none of them price wholesale.
          ...(priced.length ? { wholesalePrice: wholesale } : {}),
        },
      });
    });

    const fresh = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        variants: { orderBy: { position: "asc" } },
        images: { orderBy: { position: "asc" } },
        category: true,
      },
    });
    res.json(fresh);
  })
);

/** Adjust one variant's stock without touching the rest. */
productsRouter.patch(
  "/variants/:variantId",
  requireStaff,
  wrap(async (req, res) => {
    const data = variantSchema.partial().parse(req.body);
    res.json(
      await prisma.productVariant.update({
        where: { id: req.params.variantId },
        data: {
          ...data,
          colour: data.colour === undefined ? undefined : data.colour?.trim() || null,
          size: data.size === undefined ? undefined : data.size?.trim() || null,
        },
      })
    );
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

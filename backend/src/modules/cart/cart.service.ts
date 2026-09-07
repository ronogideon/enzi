import { PricingTier } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { effectiveUnitPrice } from "../pricing/pricing.service";

export interface CartLineInput {
  productId: string;
  /** Present when the product has variants. */
  variantId?: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  requestedQty: number;
  quantity: number; // after min-qty enforcement
  bumped: boolean; // true if we raised it to the minimum
  unitPrice: number; // cents, tier + promo applied
  lineTotal: number;
  tier: PricingTier;
  /** Quantity at which this line's price group switches to wholesale. */
  wholesaleMinQty: number | null;
  /** Combined quantity of the group this line counts toward. */
  groupQty: number;
  /** Units still needed for this group to reach the wholesale price. */
  unitsToWholesale: number;
  /** What this line would have cost per unit at retail. */
  retailUnitPrice: number;
  /** Cents saved on this line by the wholesale price. 0 when not applicable. */
  wholesaleSaving: number;
}

export interface PricedCart {
  tier: PricingTier;
  lines: PricedLine[];
  subtotal: number;
  wholesaleSaving: number;
}

/**
 * How wholesale qualification is grouped.
 *
 * Colours of the same size share a price, so buying 25 each of four colours in
 * 8*10cm is 100 units at one price and should earn the wholesale rate. Sizes
 * are priced differently, so 50 of 8*10 and 50 of 10*15 are two separate runs
 * of 50 — they must NOT combine into 100.
 *
 * So the grouping key is the product plus the size (and the price, which
 * guards the case where two sizes happen to share a name but not a price).
 * Products without variants group by product alone, which preserves the old
 * behaviour exactly.
 */
function groupKey(
  groupId: string | null,
  productId: string,
  size: string | null,
  unitPrice: number
): string {
  // Colours are separate listings that share a groupId, so the key is the
  // GROUP (falling back to the product when it has no siblings) plus the size.
  // That's what lets 25 each of four colours in 8*10cm add up to 100.
  return `${groupId ?? productId}::${size ?? ""}::${unitPrice}`;
}

/**
 * Price a cart.
 *
 * Two passes: the first resolves each line to a real product/variant and works
 * out its retail price and minimum quantity; the second applies wholesale,
 * because whether a line qualifies depends on the other lines in its group and
 * can't be known while walking them one at a time.
 */
export async function priceCart(
  lines: CartLineInput[],
  _requestedTier?: PricingTier
): Promise<PricedCart> {
  if (!lines.length) return { tier: "RETAIL", lines: [], subtotal: 0, wholesaleSaving: 0 };

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    include: { promotions: true, variants: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const categoryIds = [...new Set(products.map((p) => p.categoryId).filter(Boolean))] as string[];
  const categoryPromos = categoryIds.length
    ? await prisma.promotion.findMany({ where: { categoryId: { in: categoryIds }, active: true } })
    : [];

  // ---- pass 1: resolve, enforce minimums, compute retail pricing ----
  interface Draft {
    input: CartLineInput;
    product: (typeof products)[number];
    variant: (typeof products)[number]["variants"][number] | null;
    quantity: number;
    bumped: boolean;
    retailUnitPrice: number;
    wholesaleUnitPrice: number | null;
    wholesaleMinQty: number;
    key: string;
  }

  const drafts: Draft[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new HttpError(400, `Product unavailable: ${line.productId}`);

    let variant: Draft["variant"] = null;
    if (product.hasVariants) {
      if (!line.variantId)
        throw new HttpError(400, `Choose an option for ${product.name}`);
      variant = product.variants.find((v) => v.id === line.variantId && v.active) ?? null;
      if (!variant)
        throw new HttpError(400, `That option is no longer available for ${product.name}`);
    }

    const promos = [
      ...product.promotions,
      ...categoryPromos.filter((cp) => cp.categoryId === product.categoryId),
    ];

    // A variant's own prices override the product's when set.
    const pricingSource = {
      retailPrice: variant?.retailPrice ?? product.retailPrice,
      wholesalePrice: variant?.wholesalePrice ?? product.wholesalePrice,
      categoryId: product.categoryId,
      retailMinQty: product.retailMinQty,
      wholesaleMinQty: product.wholesaleMinQty,
    };

    // The minimum applies PER VARIANT, not to the order as a whole — ten of
    // each colour you pick, not ten spread across all of them.
    const min = Math.max(1, product.retailMinQty);
    const quantity = Math.max(line.quantity, min);

    const retailUnitPrice = effectiveUnitPrice(pricingSource as any, "RETAIL", promos);
    const wholesaleUnitPrice =
      pricingSource.wholesalePrice == null
        ? null
        : effectiveUnitPrice(pricingSource as any, "WHOLESALE", promos);

    drafts.push({
      input: line,
      product,
      variant,
      quantity,
      bumped: quantity > line.quantity,
      retailUnitPrice,
      wholesaleUnitPrice,
      wholesaleMinQty: Math.max(1, product.wholesaleMinQty),
      key: groupKey(product.groupId ?? null, product.id, variant?.size ?? null, retailUnitPrice),
    });
  }

  // ---- pass 2: total each group, then apply wholesale where it qualifies ----
  const groupTotals = new Map<string, number>();
  for (const d of drafts)
    groupTotals.set(d.key, (groupTotals.get(d.key) ?? 0) + d.quantity);

  const priced: PricedLine[] = drafts.map((d) => {
    const groupQty = groupTotals.get(d.key) ?? d.quantity;
    const qualifies = d.wholesaleUnitPrice != null && groupQty >= d.wholesaleMinQty;

    const unitPrice = qualifies ? d.wholesaleUnitPrice! : d.retailUnitPrice;
    const label = [d.variant?.colour, d.variant?.size].filter(Boolean).join(" / ") || null;

    return {
      productId: d.product.id,
      variantId: d.variant?.id ?? null,
      name: d.product.name,
      variantLabel: label,
      requestedQty: d.input.quantity,
      quantity: d.quantity,
      bumped: d.bumped,
      unitPrice,
      lineTotal: unitPrice * d.quantity,
      tier: qualifies ? "WHOLESALE" : "RETAIL",
      wholesaleMinQty: d.wholesaleUnitPrice == null ? null : d.wholesaleMinQty,
      groupQty,
      unitsToWholesale:
        d.wholesaleUnitPrice == null || qualifies
          ? 0
          : Math.max(0, d.wholesaleMinQty - groupQty),
      retailUnitPrice: d.retailUnitPrice,
      wholesaleSaving: Math.max(0, (d.retailUnitPrice - unitPrice) * d.quantity),
    };
  });

  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  const wholesaleSaving = priced.reduce((s, l) => s + l.wholesaleSaving, 0);

  return {
    tier: priced.some((l) => l.tier === "WHOLESALE") ? "WHOLESALE" : "RETAIL",
    lines: priced,
    subtotal,
    wholesaleSaving,
  };
}

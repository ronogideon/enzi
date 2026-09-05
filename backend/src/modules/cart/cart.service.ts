import { PricingTier } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { effectiveUnitPrice, minQtyFor } from "../pricing/pricing.service";

export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  name: string;
  requestedQty: number;
  quantity: number; // after min-qty enforcement
  bumped: boolean; // true if we raised it to the minimum
  unitPrice: number; // cents, tier + promo applied
  lineTotal: number;
  tier: PricingTier;
  /** Quantity at which this product switches to wholesale, if it has one. */
  wholesaleMinQty: number | null;
  /** What this line would have cost per unit at retail. */
  retailUnitPrice: number;
  /** Cents saved on this line by the wholesale price. 0 when not applicable. */
  wholesaleSaving: number;
}

export interface PricedCart {
  /** WHOLESALE when any line qualified — the cart is never wholesale as a whole. */
  tier: PricingTier;
  lines: PricedLine[];
  subtotal: number;
  /** Total saved across the cart by automatic wholesale pricing. */
  wholesaleSaving: number;
}

/**
 * Decide the tier for a single line from its quantity alone.
 *
 * Wholesale is automatic: nobody picks a tier, and there is no "are you a
 * wholesaler?" question anywhere in the shop. If a product has a wholesale
 * price and you order at least its wholesale minimum, you get that price. That
 * makes the rule self-evident from the product page ("Wholesale from 50 pcs")
 * and removes a whole class of support question about who qualifies.
 *
 * It is decided per line, not per cart, so a big order of mailers and two rolls
 * of tape prices each correctly instead of forcing one tier on both.
 */
function tierForQuantity(
  product: { wholesalePrice: number | null; wholesaleMinQty: number },
  quantity: number
): PricingTier {
  if (product.wholesalePrice == null) return "RETAIL";
  return quantity >= product.wholesaleMinQty ? "WHOLESALE" : "RETAIL";
}

/**
 * Price a cart. Enforces the per-product minimum quantity: if a customer orders
 * below the minimum we auto-bump to the minimum rather than rejecting — so
 * carts can only ever check out at or above the configured floor (the behaviour
 * that was broken on the old site).
 *
 * The `requestedTier` argument is kept for API compatibility but is no longer
 * how the price is chosen; tiers are derived from quantity per line. Passing
 * WHOLESALE can no longer buy one unit at the bulk rate.
 */
export async function priceCart(
  lines: CartLineInput[],
  _requestedTier?: PricingTier
): Promise<PricedCart> {
  if (!lines.length) throw new HttpError(400, "Cart is empty");

  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, active: true },
    include: { promotions: true },
  });

  // category-wide promos: fetch separately and merge by categoryId
  const categoryIds = [
    ...new Set(products.map((p) => p.categoryId).filter(Boolean) as string[]),
  ];
  const categoryPromos = categoryIds.length
    ? await prisma.promotion.findMany({
        where: { categoryId: { in: categoryIds }, active: true },
      })
    : [];

  const byId = new Map(products.map((p) => [p.id, p]));
  const priced: PricedLine[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product)
      throw new HttpError(400, `Product unavailable: ${line.productId}`);

    // Bump to the retail floor first, then let the resulting quantity decide
    // the tier — so a bump can itself qualify the line for wholesale.
    const quantity = Math.max(line.quantity, minQtyFor(product, "RETAIL"));
    const tier = tierForQuantity(product, quantity);

    const promos = [
      ...product.promotions,
      ...categoryPromos.filter((cp) => cp.categoryId === product.categoryId),
    ];
    const unitPrice = effectiveUnitPrice(product, tier, promos);
    const retailUnitPrice = effectiveUnitPrice(product, "RETAIL", promos);

    priced.push({
      productId: product.id,
      name: product.name,
      requestedQty: line.quantity,
      quantity,
      bumped: quantity > line.quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      tier,
      wholesaleMinQty: product.wholesalePrice == null ? null : product.wholesaleMinQty,
      retailUnitPrice,
      wholesaleSaving: Math.max(0, (retailUnitPrice - unitPrice) * quantity),
    });
  }

  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  const wholesaleSaving = priced.reduce((s, l) => s + l.wholesaleSaving, 0);

  return {
    tier: priced.some((l) => l.tier === "WHOLESALE") ? "WHOLESALE" : "RETAIL",
    lines: priced,
    subtotal,
    wholesaleSaving,
  };
}

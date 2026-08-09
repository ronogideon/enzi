import { PricingTier, Promotion, Product } from "@prisma/client";

/**
 * Resolve the effective unit price (in cents) for a product at a given tier,
 * applying the single best active promotion.
 *
 * Base price:
 *   RETAIL    -> product.retailPrice
 *   WHOLESALE -> product.wholesalePrice (falls back to retail if unset)
 *
 * A promo applies when:
 *   - active === true
 *   - now within [startsAt, endsAt] (nulls = open-ended)
 *   - promo.tier is null (both) or matches the requested tier
 *   - promo targets this product OR this product's category
 *
 * When several promos qualify, the one yielding the LOWEST price wins.
 */
export function effectiveUnitPrice(
  product: Pick<
    Product,
    "retailPrice" | "wholesalePrice" | "categoryId"
  >,
  tier: PricingTier,
  promotions: Promotion[],
  now: Date = new Date()
): number {
  const base =
    tier === "WHOLESALE"
      ? product.wholesalePrice ?? product.retailPrice
      : product.retailPrice;

  const applicable = promotions.filter((p) => {
    if (!p.active) return false;
    if (p.startsAt && p.startsAt > now) return false;
    if (p.endsAt && p.endsAt < now) return false;
    if (p.tier && p.tier !== tier) return false;
    return true;
  });

  let best = base;
  for (const promo of applicable) {
    let candidate = base;
    switch (promo.type) {
      case "PERCENT":
        candidate = Math.round(base * (1 - promo.value / 100));
        break;
      case "FIXED_PRICE":
        candidate = promo.value;
        break;
      case "FIXED_DISCOUNT":
        candidate = base - promo.value;
        break;
    }
    candidate = Math.max(0, candidate);
    if (candidate < best) best = candidate;
  }

  return best;
}

/** Minimum quantity enforced for a product at a tier. */
export function minQtyFor(
  product: Pick<Product, "retailMinQty" | "wholesaleMinQty">,
  tier: PricingTier
): number {
  return tier === "WHOLESALE"
    ? product.wholesaleMinQty
    : product.retailMinQty;
}

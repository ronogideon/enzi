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
}

export interface PricedCart {
  tier: PricingTier;
  lines: PricedLine[];
  subtotal: number;
}

/**
 * Price a cart for a tier. Enforces the per-product minimum quantity:
 * if a customer orders below the minimum, we auto-bump to the minimum
 * rather than rejecting — so retail carts can only ever check out at or
 * above the configured floor (the behaviour that was broken on the old site).
 */
export async function priceCart(
  lines: CartLineInput[],
  tier: PricingTier
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

    const min = minQtyFor(product, tier);
    const quantity = Math.max(line.quantity, min);

    const promos = [
      ...product.promotions,
      ...categoryPromos.filter((cp) => cp.categoryId === product.categoryId),
    ];
    const unitPrice = effectiveUnitPrice(product, tier, promos);

    priced.push({
      productId: product.id,
      name: product.name,
      requestedQty: line.quantity,
      quantity,
      bumped: quantity > line.quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      tier,
    });
  }

  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  return { tier, lines: priced, subtotal };
}

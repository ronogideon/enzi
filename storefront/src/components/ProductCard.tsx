"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatKes } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { SmartImage } from "./ui";

export function ProductCard({ product }: { product: Product }) {
  const { add, tier } = useCart();

  const base =
    tier === "WHOLESALE"
      ? product.wholesalePrice ?? product.retailPrice
      : product.retailPrice;
  const effective = product.effectivePrice ?? base;
  const onSale = effective < base;

  return (
    <div className="card card-hover group flex flex-col overflow-hidden">
      <Link href={`/product/${product.slug}`} className="relative block">
        <SmartImage
          src={product.images?.[0]?.url}
          alt={product.name}
          className="aspect-square w-full object-cover"
        />
        {onSale && (
          <span className="absolute left-3 top-3 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-ink">
            Sale
          </span>
        )}
        {product.stockQty <= 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-muted">
            Out of stock
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={`/product/${product.slug}`}>
          <h3 className="font-display text-lg font-bold leading-snug text-white group-hover:text-white">
            {product.name}
          </h3>
        </Link>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-white">
            {formatKes(effective)}
          </span>
          {onSale && (
            <span className="text-sm text-faint line-through">
              {formatKes(base)}
            </span>
          )}
        </div>

        {product.retailMinQty > 1 && (
          <p className="mt-1 text-xs text-faint">
            Min order {tier === "WHOLESALE" ? product.wholesaleMinQty : product.retailMinQty}
          </p>
        )}

        <div className="mt-4 flex gap-2 pt-1">
          <button
            onClick={() => add(product)}
            disabled={product.stockQty <= 0}
            className="btn-primary flex-1 px-4 py-2.5 text-xs uppercase tracking-wider"
          >
            Add to cart
          </button>
          <Link
            href={`/product/${product.slug}`}
            className="btn-ghost px-4 py-2.5 text-xs uppercase tracking-wider"
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
}

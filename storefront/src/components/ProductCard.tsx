"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatKes } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { useToast } from "./Toast";
import { SmartImage } from "./ui";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();

  // Cards always show the retail price. Wholesale is quantity-driven and gets
  // applied further down the funnel, so quoting the bulk rate on a grid tile —
  // where nobody has chosen a quantity yet — would just be misleading.
  const base = product.retailPrice;
  const effective = product.effectivePrice ?? base;
  const onSale = effective < base;
  const wholesaleMin = product.wholesalePrice != null ? product.wholesaleMinQty : null;
  const out = product.stockQty <= 0;

  return (
    <div className="card lift group flex flex-col overflow-hidden hover:border-white/15">
      <Link href={`/product/${product.slug}`} className="zoom-frame relative block">
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
        {out && (
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-muted backdrop-blur-sm">
            Out of stock
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={`/product/${product.slug}`}>
          <h3 className="font-display text-lg font-bold leading-snug text-white">
            {product.name}
          </h3>
        </Link>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-white">{formatKes(effective)}</span>
          {onSale && (
            <span className="text-sm text-faint line-through">{formatKes(base)}</span>
          )}
        </div>

        <div className="mt-1 space-y-0.5 text-xs text-faint">
          {product.retailMinQty > 1 && <p>Min order {product.retailMinQty} pcs</p>}
          {wholesaleMin != null && (
            <p className="text-whatsapp/80">Wholesale from {wholesaleMin} pcs</p>
          )}
        </div>

        <div className="mt-4 flex gap-2 pt-1">
          <button
            onClick={() => {
              add(product);
              toast("Added to cart", { duration: 2000 });
            }}
            disabled={out}
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

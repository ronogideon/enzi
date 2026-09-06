"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { useCart } from "@/lib/cart";
import { useToast } from "@/components/Toast";
import { formatKes } from "@/lib/money";
import { QuantityInput } from "./QuantityInput";

/**
 * Wholesale is automatic and quantity-driven — there is no tier to pick.
 *
 * The threshold is stated plainly next to the minimum order quantity, the bulk
 * price is applied the moment the quantity reaches it, and crossing that line
 * is confirmed with a short celebratory toast. Nobody has to know what
 * "wholesale tier" means or ask whether they qualify: they raise the number and
 * the price changes in front of them.
 */
export function AddToCartPanel({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();

  const min = product.retailMinQty ?? 1;
  const wholesaleMin = product.wholesalePrice != null ? product.wholesaleMinQty : null;

  const [qty, setQty] = useState(min);
  // Only celebrate the first crossing per visit — a toast on every increment
  // past the threshold would be noise, not delight.
  const [celebrated, setCelebrated] = useState(false);

  const retailUnit = product.effectivePrice ?? product.retailPrice;
  const wholesaleUnit = product.effectiveWholesalePrice ?? product.wholesalePrice ?? null;

  const isWholesale = wholesaleMin != null && qty >= wholesaleMin;
  const unitPrice = isWholesale && wholesaleUnit != null ? wholesaleUnit : retailUnit;
  const savingPerUnit = wholesaleUnit != null ? Math.max(0, retailUnit - wholesaleUnit) : 0;

  const out = product.stockQty <= 0;

  /** Single place quantity changes, so the celebration can't be missed. */
  function changeQty(next: number) {
    const clamped = Math.max(min, next);
    const crossed =
      wholesaleMin != null && clamped >= wholesaleMin && qty < wholesaleMin;

    setQty(clamped);

    if (crossed && !celebrated) {
      setCelebrated(true);
      toast("Wholesale discount applied", { duration: 2000, confetti: true });
    }
    // Dropping back below the threshold re-arms the celebration, so the next
    // crossing still feels like something happened.
    if (wholesaleMin != null && clamped < wholesaleMin) setCelebrated(false);
  }

  function handleAdd() {
    add(product, Math.max(qty, min));
    toast(isWholesale ? "Added at the wholesale price" : "Added to cart", {
      duration: 2000,
    });
  }

  const toWholesale = wholesaleMin != null ? wholesaleMin - qty : 0;

  return (
    <div className="mt-8">
      {/* Price, which changes live as the quantity crosses the threshold. */}
      <div className="flex items-baseline gap-3">
        <span
          key={unitPrice}
          className="animate-pop font-display text-3xl font-extrabold text-white"
        >
          {formatKes(unitPrice)}
        </span>
        {isWholesale && savingPerUnit > 0 && (
          <span className="text-sm text-faint line-through">{formatKes(retailUnit)}</span>
        )}
        <span className="text-sm text-muted">each</span>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        {min > 1 && (
          <p className="text-faint">
            Minimum order quantity: <span className="text-cloud">{min} pcs</span>
          </p>
        )}
        {wholesaleMin != null && (
          <p className={isWholesale ? "text-whatsapp" : "text-faint"}>
            Wholesale minimum: <span className={isWholesale ? "" : "text-cloud"}>{wholesaleMin} pcs</span>
            {isWholesale ? (
              <span className="ml-1">— applied</span>
            ) : savingPerUnit > 0 ? (
              <span className="ml-1">
                — save {formatKes(savingPerUnit)} each
              </span>
            ) : null}
          </p>
        )}
      </div>

      {/* A nudge only when it's genuinely close, so it reads as helpful
          rather than as an upsell on every product page. */}
      {wholesaleMin != null && !isWholesale && toWholesale > 0 && toWholesale <= Math.max(10, wholesaleMin * 0.25) && (
        <button
          type="button"
          onClick={() => changeQty(wholesaleMin)}
          className="animate-fade mt-3 rounded-full border border-whatsapp/30 bg-whatsapp/10 px-4 py-2 text-xs font-medium text-whatsapp transition-colors hover:bg-whatsapp/20"
        >
          Add {toWholesale} more for the wholesale price
        </button>
      )}

      <div className="mt-5 flex items-center gap-4">
        <QuantityInput value={qty} min={min} onChange={changeQty} />

        <button
          onClick={handleAdd}
          disabled={out}
          className="btn-primary flex-1 sm:flex-none sm:px-10"
        >
          {out ? "Out of stock" : "Add to cart"}
        </button>
      </div>

      <p className="mt-4 text-sm text-muted">
        Subtotal{" "}
        <span className="font-medium text-cloud">{formatKes(unitPrice * qty)}</span>{" "}
        for {qty} pcs
      </p>

      <div className="mt-4">
        <Link
          href="/cart"
          className="text-sm text-muted underline-offset-4 transition-colors hover:text-cloud hover:underline"
        >
          Go to cart →
        </Link>
      </div>
    </div>
  );
}

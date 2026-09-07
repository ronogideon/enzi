"use client";

import { useMemo, useState } from "react";
import type { Product, ProductVariant } from "@/lib/types";
import { formatKes } from "@/lib/money";
import { imageUrl } from "@/lib/api";

/**
 * Variant selector.
 *
 * Colour first, then the sizes that exist *for that colour* — the size list is
 * derived from the variants rather than being a fixed axis, because the shop
 * genuinely stocks different size ranges per colour.
 *
 * Each size row carries its own price and its own quantity box, so one visit
 * can order 25 of 8*10 and 40 of 10*15 together. That matters here because
 * wholesale is earned by the combined quantity within a size across colours,
 * and forcing one variant per trip to the cart would hide that from the buyer.
 */
export function VariantSelector({
  product,
  variants: incoming,
  quantities,
  onQuantityChange,
  onAdd,
  summary,
}: {
  product: Product;
  /** The sizes for the colour currently on screen. */
  variants: ProductVariant[];
  /** Quantities across EVERY colour, keyed by variant id. */
  quantities: Record<string, number>;
  onQuantityChange: (variantId: string, qty: number) => void;
  onAdd: () => void;
  /** Totals across all colours, for the summary line. */
  summary: { units: number; cost: number; wholesaleApplied: boolean };
}) {

  const variants = useMemo(
    () => incoming.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [incoming]
  );

  const sizes = variants;
  const minQty = Math.max(1, product.retailMinQty ?? 1);
  const setQty = onQuantityChange;

  // Only this colour's lines — the parent owns the full picture.
  const chosen = variants
    .map((variant) => ({ variant, quantity: quantities[variant.id] ?? 0 }))
    .filter((e) => e.quantity > 0);

  const wholesaleMin = Math.max(1, product.wholesaleMinQty ?? 1);

  /**
   * Price each size at the rate it has actually earned.
   *
   * Wholesale is won per size, so a line qualifies on its own quantity — the
   * total was previously computed at retail regardless, which is why the page
   * said Ksh 3,500 for 100 while the cart correctly charged the wholesale rate.
   *
   * The page can only count what's on screen (this colour). Wholesale also
   * counts across colours, so this is a floor: a buyer adding a second colour
   * can qualify at the cart even if this page hasn't shown it yet.
   */
  const priceFor = (v: ProductVariant, qty: number) =>
    v.wholesalePrice != null && qty >= wholesaleMin ? v.wholesalePrice : v.retailPrice;


  // Every line must clear the minimum — the floor is per option, not per order.
  // Checked against ALL colours, not just the one on screen: someone who put 60
  // into black then switched to pink would otherwise find the button dead.
  const belowMin = chosen.filter((e) => e.quantity < minQty);
  const canAdd = summary.units > 0 && belowMin.length === 0;

  const handleAdd = onAdd;

  if (!variants.length) return null;

  return (
    <div className="mt-8">
      {/* ---- sizes for the chosen colour ---- */}
      <div className="mt-8">
        {sizes.some((v) => v.size) && (
          <p className="font-semibold text-white">Size</p>
        )}

        <div className="mt-3 divide-y divide-ink-line overflow-hidden rounded-xl border border-ink-line">
          {sizes.map((v) => {
            const qty = quantities[v.id] ?? 0;
            const tooLow = qty > 0 && qty < minQty;

            return (
              <div
                key={v.id}
                /* One row on every screen: name takes the slack, price and
                   stepper sit tight to the right. The name previously forced
                   its own line on mobile, wasting the width entirely. */
                className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${
                  v.inStock ? "" : "opacity-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cloud">
                    {v.size || v.colour || "Standard"}
                  </span>
                  {!v.inStock && (
                    <span className="ml-2 text-xs text-faint">Out of stock</span>
                  )}
                  {tooLow && (
                    <span className="block text-xs text-gold">
                      Minimum {minQty} pcs for this option
                    </span>
                  )}
                </span>

                <span className="shrink-0 text-right text-sm">
                  <span className="font-medium text-white">
                    {formatKes(priceFor(v, qty))}
                  </span>
                  {v.wholesalePrice != null && qty >= wholesaleMin && (
                    <span className="block text-[10px] text-whatsapp">wholesale</span>
                  )}
                </span>

                <QtyBox
                  value={qty}
                  min={minQty}
                  disabled={!v.inStock}
                  onChange={(n) => setQty(v.id, n)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- running total + add ---- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          {summary.units > 0 ? (
            <>
              <span className="text-muted">{summary.units} pcs · </span>
              <span className="font-medium text-white">{formatKes(summary.cost)}</span>
              {summary.wholesaleApplied && (
                <span className="ml-2 text-xs text-whatsapp">wholesale price applied</span>
              )}
              {/* Wholesale is earned per size across colours, so the count that
                  matters is per size — spell that out rather than letting a
                  buyer assume the cart total decides it. */}
              {product.wholesaleMinQty && product.wholesaleMinQty > 1 && (
                <span className="block text-xs text-faint">
                  Wholesale price applies at {product.wholesaleMinQty} pcs of the same size
                  {(product.colourOptions?.length ?? 0) > 1 && ", counted across colours"}
                </span>
              )}
            </>
          ) : (
            <span className="text-faint">Choose a quantity to continue</span>
          )}
        </div>

        <button onClick={handleAdd} disabled={!canAdd} className="btn-primary px-8">
          Add to cart
        </button>
      </div>

      {belowMin.length > 0 && (
        <p className="mt-2 text-xs text-gold">
          Each option needs at least {minQty} pcs.
        </p>
      )}
    </div>
  );
}

/**
 * Quantity box for a size row. Typed entry is the point — bulk buyers enter
 * 250, and the minimum is only enforced on blur so it doesn't fight someone
 * part-way through typing "2" on the way to "25".
 */
function QtyBox({
  value,
  min,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(value ? String(value) : "0");

  function commit(raw: string) {
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      setDraft("0");
      onChange(0);
      return;
    }
    // Below the minimum but not zero: raise it rather than silently dropping
    // the line, so the customer keeps what they meant to order.
    const next = n < min ? min : n;
    setDraft(String(next));
    onChange(next);
  }

  return (
    <div
      className={`inline-flex shrink-0 items-center rounded-full border border-ink-line ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => {
          const next = value <= min ? 0 : value - 1;
          setDraft(String(next));
          onChange(next);
        }}
        disabled={value === 0}
        className="grid h-8 w-8 place-items-center text-muted transition-colors hover:text-cloud active:scale-90 disabled:opacity-30"
      >
        −
      </button>

      <input
        value={draft}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Quantity"
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-12 bg-transparent py-1.5 text-center text-sm text-cloud focus:outline-none"
      />

      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => {
          const next = value === 0 ? min : value + 1;
          setDraft(String(next));
          onChange(next);
        }}
        className="grid h-8 w-8 place-items-center text-muted transition-colors hover:text-cloud active:scale-90"
      >
        +
      </button>
    </div>
  );
}

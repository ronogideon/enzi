"use client";

import { useEffect, useMemo, useState } from "react";
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
  groupQtyFor,
  onAdd,
  summary,
}: {
  product: Product;
  /** The sizes for the colour currently on screen. */
  variants: ProductVariant[];
  /** Quantities across EVERY colour, keyed by variant id. */
  quantities: Record<string, number>;
  onQuantityChange: (variantId: string, qty: number) => void;
  /** Combined quantity of this size across every colour — what earns wholesale. */
  groupQtyFor: (variant: ProductVariant) => number;
  onAdd: () => void;
  /** Totals across all colours, for the summary line. */
  summary: {
    units: number;
    cost: number;
    wholesaleApplied: boolean;
    /** Lines below their minimum, counted across every colour. */
    belowMin: number;
  };
}) {

  const variants = useMemo(
    () => incoming.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [incoming]
  );

  const sizes = variants;
  const minQty = Math.max(1, product.retailMinQty ?? 1);
  const setQty = onQuantityChange;

  const wholesaleMin = Math.max(1, product.wholesaleMinQty ?? 1);

  /**
   * Price each size at the rate it has actually earned.
   *
   * Wholesale is won per size across the whole colour group, which is how the
   * cart prices it, so the row reads the combined quantity from the parent
   * rather than only what's on screen. 60 black plus 40 pink of one size shows
   * the wholesale rate on both, because that is what will be charged.
   */
  const qualifies = (v: ProductVariant) =>
    v.wholesalePrice != null && groupQtyFor(v) >= wholesaleMin;

  const priceFor = (v: ProductVariant) =>
    qualifies(v) ? v.wholesalePrice! : v.retailPrice;

  // Every line must clear the minimum — the floor is per option, not per order.
  // Counted across ALL colours by the parent, not just the one on screen.
  const canAdd = summary.units > 0 && summary.belowMin === 0;

  /** Of the running total, how much is held against colours not on screen. */
  const onScreen = variants.reduce((n, v) => n + (quantities[v.id] ?? 0), 0);
  const elsewhere = Math.max(0, summary.units - onScreen);

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
                    {formatKes(priceFor(v))}
                  </span>
                  {qualifies(v) && (
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
              {/* The total counts colours that aren't on screen, so say so —
                  otherwise it reads as a bug rather than as the running order. */}
              {elsewhere > 0 && (
                <span className="block text-xs text-muted">
                  Includes {elsewhere} pcs chosen in other colours
                </span>
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

        {/* The label names the whole selection, so it's clear that one tap
            takes every colour rather than only what's on screen. */}
        <button onClick={handleAdd} disabled={!canAdd} className="btn-primary px-8">
          {summary.units > 0 ? `Add ${summary.units} pcs to cart` : "Add to cart"}
        </button>
      </div>

      {summary.belowMin > 0 && (
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

  // The box used to read `value` once and never again, so clearing the
  // selection after an add — or restoring a saved one — left the old number
  // sitting in the field while the real quantity was something else.
  useEffect(() => {
    setDraft(value ? String(value) : "0");
  }, [value]);

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

"use client";

import { useMemo, useState } from "react";
import type { Product, ProductVariant } from "@/lib/types";
import { useCart } from "@/lib/cart";
import { useToast } from "@/components/Toast";
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
  onVariantChange,
}: {
  product: Product;
  /** Lets the gallery swap to the selected colour's photos. */
  onVariantChange?: (variant: ProductVariant | null) => void;
}) {
  const { addMany } = useCart();
  const { toast } = useToast();

  const variants = useMemo(
    () => (product.variants ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [product.variants]
  );

  // Distinct colours, in variant order, keeping the first variant of each so we
  // can read its swatch.
  const colours = useMemo(() => {
    const seen = new Map<string, ProductVariant>();
    for (const v of variants) {
      const key = v.colour ?? "";
      if (!seen.has(key)) seen.set(key, v);
    }
    return [...seen.entries()].map(([colour, sample]) => ({
      colour,
      sample,
      // A colour is only sold out when every size under it is.
      inStock: variants.some((v) => (v.colour ?? "") === colour && v.inStock),
    }));
  }, [variants]);

  const hasColours = colours.some((c) => c.colour !== "");

  const [selectedColour, setSelectedColour] = useState<string>(
    () => colours.find((c) => c.inStock)?.colour ?? colours[0]?.colour ?? ""
  );

  // Sizes available for the chosen colour.
  const sizes = useMemo(
    () => variants.filter((v) => (v.colour ?? "") === selectedColour),
    [variants, selectedColour]
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const minQty = Math.max(1, product.retailMinQty ?? 1);

  function pickColour(colour: string) {
    setSelectedColour(colour);
    const first = variants.find((v) => (v.colour ?? "") === colour) ?? null;
    onVariantChange?.(first);
  }

  function setQty(variantId: string, raw: number) {
    setQuantities((q) => {
      const next = { ...q };
      if (!raw || raw <= 0) delete next[variantId];
      else next[variantId] = raw;
      return next;
    });
  }

  const chosen = Object.entries(quantities)
    .map(([id, quantity]) => ({
      variant: variants.find((v) => v.id === id)!,
      quantity,
    }))
    .filter((e) => e.variant);

  const totalUnits = chosen.reduce((n, e) => n + e.quantity, 0);
  const totalCost = chosen.reduce((n, e) => n + e.variant.retailPrice * e.quantity, 0);

  // Every line must clear the minimum — the floor is per option, not per order.
  const belowMin = chosen.filter((e) => e.quantity < minQty);
  const canAdd = chosen.length > 0 && belowMin.length === 0;

  function handleAdd() {
    if (!canAdd) return;
    addMany(product, chosen);
    setQuantities({});
    toast(
      chosen.length === 1
        ? "Added to cart"
        : `${chosen.length} options added to cart`,
      { duration: 2000 }
    );
  }

  if (!variants.length) return null;

  return (
    <div className="mt-8">
      {/* ---- colours ---- */}
      {hasColours && (
        <div>
          <p className="text-sm">
            <span className="font-semibold text-white">Colour:</span>{" "}
            <span className="text-muted">{selectedColour || "—"}</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {colours.map(({ colour, sample, inStock }) => {
              const active = colour === selectedColour;
              const swatchImage = sample.swatchMediaId
                ? imageUrl(`/api/media/${sample.swatchMediaId}`)
                : null;

              return (
                <button
                  key={colour || "default"}
                  type="button"
                  onClick={() => pickColour(colour)}
                  disabled={!inStock}
                  aria-pressed={active}
                  title={inStock ? colour : `${colour} — out of stock`}
                  className={`relative overflow-hidden rounded-xl border-2 transition-all duration-150 ${
                    active ? "border-white" : "border-ink-line hover:border-white/40"
                  } ${!inStock ? "cursor-not-allowed opacity-40" : ""} ${
                    swatchImage ? "h-14 w-14" : "px-4 py-2.5"
                  }`}
                >
                  {swatchImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={swatchImage}
                      alt={colour}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex items-center gap-2 text-sm text-cloud">
                      {sample.colourHex && (
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: sample.colourHex }}
                          aria-hidden
                        />
                      )}
                      {colour}
                    </span>
                  )}
                  {!inStock && (
                    <span className="absolute inset-0 grid place-items-center bg-ink/60 text-[10px] uppercase tracking-wide text-faint">
                      Sold out
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- sizes for the chosen colour ---- */}
      <div className={hasColours ? "mt-8" : ""}>
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
                className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                  v.inStock ? "" : "opacity-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-cloud">{v.size || v.colour || "Standard"}</span>
                  {!v.inStock && (
                    <span className="ml-2 text-xs text-faint">Out of stock</span>
                  )}
                  {tooLow && (
                    <span className="block text-xs text-gold">
                      Minimum {minQty} pcs for this option
                    </span>
                  )}
                </span>

                <span className="shrink-0 text-sm font-medium text-white">
                  {formatKes(v.retailPrice)}
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
          {totalUnits > 0 ? (
            <>
              <span className="text-muted">{totalUnits} pcs · </span>
              <span className="font-medium text-white">{formatKes(totalCost)}</span>
              {product.wholesaleMinQty && product.wholesalePrice && (
                <span className="block text-xs text-faint">
                  Wholesale price applies at {product.wholesaleMinQty} pcs of the same size
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

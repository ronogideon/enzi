import { useState } from "react";
import { kesToCents, centsToKes } from "@/lib/money";
import type { ProductVariant } from "@/lib/types";
import { Icon } from "@/components/Icons";
import { Toggle } from "@/components/ui";

export interface DraftVariant {
  id?: string;
  colour: string;
  size: string;
  colourHex: string;
  swatchMediaId: string | null;
  sku: string;
  retailPrice: string; // KES, as typed
  wholesalePrice: string;
  stockQty: string;
  active: boolean;
}

export function toDraft(v: ProductVariant): DraftVariant {
  return {
    id: v.id,
    colour: v.colour ?? "",
    size: v.size ?? "",
    colourHex: v.colourHex ?? "",
    swatchMediaId: v.swatchMediaId ?? null,
    sku: v.sku ?? "",
    retailPrice: String(centsToKes(v.retailPrice)),
    wholesalePrice: v.wholesalePrice != null ? String(centsToKes(v.wholesalePrice)) : "",
    stockQty: String(v.stockQty ?? 0),
    active: v.active ?? true,
  };
}

/**
 * Variant editor.
 *
 * Deliberately a flat list rather than a colour × size matrix: the size range
 * genuinely differs by colour here, so a grid would force you to create
 * combinations you don't stock and then remember to disable them. A list of
 * real rows means what's on screen is exactly what's buyable.
 *
 * The generator below covers the common case where the sizes ARE the same
 * across colours — type the colours and sizes once and it fills the rows in.
 */
export function VariantEditor({
  variants,
  onChange,
  defaultRetail,
}: {
  variants: DraftVariant[];
  onChange: (next: DraftVariant[]) => void;
  defaultRetail: string;
}) {
  const [bulkColours, setBulkColours] = useState("");
  const [bulkSizes, setBulkSizes] = useState("");
  const [showGenerator, setShowGenerator] = useState(false);

  const set = (i: number, patch: Partial<DraftVariant>) =>
    onChange(variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const addRow = () =>
    onChange([
      ...variants,
      {
        colour: "",
        size: "",
        colourHex: "",
        swatchMediaId: null,
        sku: "",
        retailPrice: defaultRetail || "",
        wholesalePrice: "",
        stockQty: "0",
        active: true,
      },
    ]);

  function generate() {
    const colours = bulkColours.split(",").map((c) => c.trim()).filter(Boolean);
    const sizes = bulkSizes.split(",").map((s) => s.trim()).filter(Boolean);
    if (!colours.length && !sizes.length) return;

    const combos: DraftVariant[] = [];
    const colourList = colours.length ? colours : [""];
    const sizeList = sizes.length ? sizes : [""];

    for (const colour of colourList) {
      for (const size of sizeList) {
        // Never overwrite a row that already exists — the generator only fills
        // gaps, so running it again after adding a colour is safe.
        const exists = variants.some(
          (v) =>
            v.colour.toLowerCase() === colour.toLowerCase() &&
            v.size.toLowerCase() === size.toLowerCase()
        );
        if (exists) continue;
        combos.push({
          colour,
          size,
          colourHex: "",
          swatchMediaId: null,
          sku: "",
          retailPrice: defaultRetail || "",
          wholesalePrice: "",
          stockQty: "0",
          active: true,
        });
      }
    }
    onChange([...variants, ...combos]);
    setBulkColours("");
    setBulkSizes("");
    setShowGenerator(false);
  }

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const v of variants) {
    const key = `${v.colour.toLowerCase()}::${v.size.toLowerCase()}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label mb-0">Options</p>
          <p className="text-xs text-faint">
            Each colour and size combination you actually stock, with its own price and
            stock level.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setShowGenerator((v) => !v)}
          >
            Generate
          </button>
          <button type="button" className="btn-ghost text-xs" onClick={addRow}>
            <Icon.Plus className="h-3.5 w-3.5" />
            Add option
          </button>
        </div>
      </div>

      {showGenerator && (
        <div className="mb-4 rounded-xl border border-indigo/40 bg-ink-800/60 p-4">
          <p className="text-xs text-muted">
            For when every colour comes in the same sizes. Separate with commas — existing
            rows are left alone.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Colours</label>
              <input
                className="field"
                value={bulkColours}
                onChange={(e) => setBulkColours(e.target.value)}
                placeholder="White, Chocolate, Blue"
              />
            </div>
            <div>
              <label className="label">Sizes</label>
              <input
                className="field"
                value={bulkSizes}
                onChange={(e) => setBulkSizes(e.target.value)}
                placeholder="8*10cm, 10*15cm"
              />
            </div>
          </div>
          <button type="button" className="btn-primary mt-3 text-xs" onClick={generate}>
            Create the combinations
          </button>
        </div>
      )}

      {variants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-line p-6 text-center">
          <p className="text-sm text-muted">
            No options yet — this product sells as a single item.
          </p>
          <p className="mt-1 text-xs text-faint">
            Add options if it comes in different colours or sizes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers, desktop only — the cards carry their own labels on
              mobile where a table header would be off-screen. */}
          <div className="hidden gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint sm:grid sm:grid-cols-[1.2fr_1.2fr_1fr_1fr_0.8fr_auto]">
            <span>Colour</span>
            <span>Size</span>
            <span>Retail (Ksh)</span>
            <span>Wholesale (Ksh)</span>
            <span>Stock</span>
            <span />
          </div>

          {variants.map((v, i) => {
            const key = `${v.colour.toLowerCase()}::${v.size.toLowerCase()}`;
            const dupe = duplicates.has(key);
            return (
              <div
                key={i}
                className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.2fr_1.2fr_1fr_1fr_0.8fr_auto] sm:items-center ${
                  dupe ? "border-danger/50" : "border-ink-line"
                } ${v.active ? "" : "opacity-50"}`}
              >
                <div>
                  <label className="label sm:hidden">Colour</label>
                  <input
                    className="field"
                    value={v.colour}
                    onChange={(e) => set(i, { colour: e.target.value })}
                    placeholder="White"
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Size</label>
                  <input
                    className="field"
                    value={v.size}
                    onChange={(e) => set(i, { size: e.target.value })}
                    placeholder="8*10cm"
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Retail (Ksh)</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    value={v.retailPrice}
                    onChange={(e) => set(i, { retailPrice: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Wholesale (Ksh)</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    value={v.wholesalePrice}
                    onChange={(e) => set(i, { wholesalePrice: e.target.value })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Stock</label>
                  <input
                    className="field"
                    type="number"
                    value={v.stockQty}
                    onChange={(e) => set(i, { stockQty: e.target.value })}
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Toggle
                    checked={v.active}
                    onChange={(on) => set(i, { active: on })}
                    label="Available"
                  />
                  <button
                    type="button"
                    onClick={() => onChange(variants.filter((_, idx) => idx !== i))}
                    className="text-muted transition-colors hover:text-danger"
                    aria-label="Remove option"
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>

                {dupe && (
                  <p className="text-xs text-danger sm:col-span-6">
                    Duplicate combination — colour and size together must be unique.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {variants.length > 0 && (
        <p className="mt-3 text-xs text-faint">
          Stock is tracked per option. A sold-out colour or size is hidden from customers
          automatically; the exact numbers are never shown on the shop.
        </p>
      )}
    </div>
  );
}

/** Turn drafts into the payload the API expects. */
export function draftsToPayload(variants: DraftVariant[]) {
  return variants.map((v, i) => ({
    id: v.id,
    colour: v.colour.trim() || null,
    size: v.size.trim() || null,
    colourHex: v.colourHex.trim() || null,
    swatchMediaId: v.swatchMediaId,
    sku: v.sku.trim() || null,
    retailPrice: kesToCents(Number(v.retailPrice) || 0),
    wholesalePrice: v.wholesalePrice ? kesToCents(Number(v.wholesalePrice)) : null,
    stockQty: Number(v.stockQty) || 0,
    active: v.active,
    position: i,
  }));
}


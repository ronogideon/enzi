import { useMemo, useState } from "react";
import { kesToCents, centsToKes } from "@/lib/money";
import type { ProductVariant } from "@/lib/types";
import { Icon } from "@/components/Icons";
import { Toggle } from "@/components/ui";

/**
 * Sizes carry the price; each size row also carries its stock.
 *
 * Every colour of a given size sells for the same money, so asking the shop to
 * retype the price against each colour was busywork that also invited typos —
 * and a colour priced differently by accident would quietly break wholesale
 * grouping, which keys on size and price together.
 *
 * Colours are separate listings (see the Colours panel on the product form), so
 * this editor only deals with the sizes of the listing in front of you.
 */

export interface SizeRow {
  id?: string;
  name: string;
  retailPrice: string; // KES as typed
  wholesalePrice: string;
  stockQty: string;
  active: boolean;
}

export const emptySizes: SizeRow[] = [];

export function sizesFromVariants(variants: ProductVariant[]): SizeRow[] {
  return variants.map((v) => ({
    id: v.id,
    name: v.size ?? "",
    retailPrice: String(centsToKes(v.retailPrice)),
    wholesalePrice: v.wholesalePrice != null ? String(centsToKes(v.wholesalePrice)) : "",
    stockQty: String(v.stockQty ?? 0),
    active: v.active ?? true,
  }));
}

export function sizesToPayload(sizes: SizeRow[], colourName?: string | null) {
  return sizes.map((s, i) => ({
    id: s.id,
    // The colour is the listing's, stamped onto each size so order lines read
    // "White / 8*10cm" without another lookup.
    colour: colourName?.trim() || null,
    size: s.name.trim() || null,
    retailPrice: kesToCents(Number(s.retailPrice) || 0),
    wholesalePrice: s.wholesalePrice ? kesToCents(Number(s.wholesalePrice)) : null,
    stockQty: Number(s.stockQty) || 0,
    active: s.active,
    position: i,
  }));
}

export function VariantEditor({
  sizes,
  onChange,
  defaultRetail,
  defaultWholesale,
}: {
  sizes: SizeRow[];
  onChange: (next: SizeRow[]) => void;
  defaultRetail: string;
  defaultWholesale: string;
}) {
  const [newSize, setNewSize] = useState("");

  const set = (i: number, patch: Partial<SizeRow>) =>
    onChange(sizes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  function addSize(name?: string) {
    const value = (name ?? newSize).trim();
    if (!value) return;
    if (sizes.some((s) => s.name.toLowerCase() === value.toLowerCase())) return;
    onChange([
      ...sizes,
      {
        name: value,
        retailPrice: defaultRetail,
        wholesalePrice: defaultWholesale,
        stockQty: "0",
        active: true,
      },
    ]);
    setNewSize("");
  }

  const totalStock = useMemo(
    () => sizes.reduce((n, s) => n + (Number(s.stockQty) || 0), 0),
    [sizes]
  );

  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const s of sizes) {
      const k = s.name.trim().toLowerCase();
      if (seen.has(k)) dupes.add(k);
      seen.add(k);
    }
    return dupes;
  }, [sizes]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="label mb-0">Sizes &amp; pricing</p>
        {sizes.length > 0 && (
          <span className="text-xs text-faint">
            {sizes.length} size{sizes.length === 1 ? "" : "s"} · {totalStock} in stock
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-faint">
        One price per size — every colour of that size sells for the same amount. Stock is
        counted per size on this listing.
      </p>

      {sizes.length > 0 && (
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-faint sm:grid sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto]">
            <span>Size</span>
            <span>Retail (Ksh)</span>
            <span>Wholesale (Ksh)</span>
            <span>Stock</span>
            <span />
          </div>

          {sizes.map((s, i) => {
            const dupe = duplicates.has(s.name.trim().toLowerCase());
            return (
              <div
                key={i}
                className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto] sm:items-center sm:border-0 sm:p-1 ${
                  dupe ? "border-danger/50" : "border-ink-line"
                } ${s.active ? "" : "opacity-50"}`}
              >
                <div>
                  <label className="label sm:hidden">Size</label>
                  <input
                    className="field"
                    value={s.name}
                    onChange={(e) => set(i, { name: e.target.value })}
                    placeholder="8*10cm"
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Retail (Ksh)</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    value={s.retailPrice}
                    onChange={(e) => set(i, { retailPrice: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Wholesale (Ksh)</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    value={s.wholesalePrice}
                    onChange={(e) => set(i, { wholesalePrice: e.target.value })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="label sm:hidden">Stock</label>
                  <input
                    className="field"
                    type="number"
                    value={s.stockQty}
                    onChange={(e) => set(i, { stockQty: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Toggle
                    checked={s.active}
                    onChange={(v) => set(i, { active: v })}
                    label={`${s.name} available`}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(sizes.filter((_, idx) => idx !== i))}
                    className="text-muted transition-colors hover:text-danger"
                    aria-label={`Remove size ${s.name}`}
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
                {dupe && (
                  <p className="text-xs text-danger sm:col-span-5">
                    Duplicate size — each must be unique.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className="field"
          value={newSize}
          onChange={(e) => setNewSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSize();
            }
          }}
          placeholder="Add a size — 8*10cm"
        />
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={() => addSize()}>
          <Icon.Plus className="h-3.5 w-3.5" />
          Add size
        </button>
      </div>

      {sizes.length === 0 && (
        <p className="mt-3 text-xs text-faint">
          No sizes — this listing sells as a single item at the price above.
        </p>
      )}
    </div>
  );
}

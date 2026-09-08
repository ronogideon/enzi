"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColourOption, Product, ProductVariant } from "@/lib/types";
import { ProductGallery } from "./ProductGallery";
import { VariantSelector } from "./VariantSelector";
import { AddToCartPanel } from "./AddToCartPanel";
import { useCart } from "@/lib/cart";
import { useToast } from "@/components/Toast";
import { imageUrl } from "@/lib/api";

/**
 * The buy side of a product page: colour switcher, gallery and size selector.
 *
 * Colours are separate listings that share a group, so each colour has its own
 * URL, its own photos and its own SEO. Switching happens entirely in the UI —
 * the sibling's images, sizes and prices arrived with the page — and the
 * address bar is corrected underneath with the History API.
 *
 * That last part matters more than it sounds. This used to call
 * `router.replace()`, which is a real App Router navigation: the server
 * component re-rendered for the new slug, this component remounted, and every
 * quantity typed against the previous colour was wiped. `history.replaceState`
 * updates the URL without unmounting anything, so the selection survives —
 * which is the whole point when wholesale is earned across colours.
 */
export function ProductBuyPanel({ product }: { product: Product }) {
  const colours = useMemo(
    () =>
      (product.colourOptions ?? [])
        .slice()
        .sort((a, b) => (a.groupPosition ?? 0) - (b.groupPosition ?? 0)),
    [product.colourOptions]
  );

  const { add, addMany } = useCart();
  const { toast } = useToast();

  // Which sibling is showing. Starts on the listing that was actually
  // requested, so a direct link to the white page opens on white.
  const [activeId, setActiveId] = useState<string>(product.id);

  /**
   * Every buyable line in the group — the sizes of every colour, or the
   * colour listings themselves when the product has no sizes — keyed so a
   * quantity can be held against any of them from any colour.
   */
  const catalogue = useMemo(() => {
    const map = new Map<
      string,
      { listing: Product; variant: ProductVariant | null }
    >();

    const record = (listing: Product) => {
      const variants = listing.variants ?? [];
      if (variants.length) {
        for (const v of variants) map.set(v.id, { listing, variant: v });
      } else {
        // No sizes: the listing itself is the line.
        map.set(listingKey(listing.id), { listing, variant: null });
      }
    };

    record(product);
    for (const c of colours) if (c.id !== product.id) record(listingFor(product, c));
    return map;
  }, [product, colours]);

  /**
   * Quantities for EVERY colour, keyed as above, held here rather than in the
   * selector so switching colour is a view change and nothing more.
   *
   * Mirrored to sessionStorage against the colour group, so a reload, a trip
   * to the cart and back, or a tap on a sibling's real URL all return the
   * buyer to what they had chosen.
   */
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const groupKey = `enzi.pdp.v1.${product.groupId ?? product.id}`;
  const hydrated = useRef(false);
  const firstSave = useRef(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(groupKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        const valid: Record<string, number> = {};
        for (const [key, qty] of Object.entries(parsed)) {
          // Drop anything that has since sold out or been delisted rather
          // than restoring a selection that can no longer be bought.
          const entry = catalogue.get(key);
          if (!entry) continue;
          const inStock = entry.variant
            ? entry.variant.inStock
            : entry.listing.inStock !== false;
          if (inStock && typeof qty === "number" && qty > 0) valid[key] = qty;
        }
        setQuantities(valid);
      }
    } catch {
      /* private mode, quota, corrupt JSON — start empty */
    }
    hydrated.current = true;
    // Runs once per group; the catalogue is stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    // The first pass runs with the empty initial state, right after the read
    // above — writing it would clear the very selection just restored.
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    try {
      const live = Object.entries(quantities).filter(([, q]) => q > 0);
      if (live.length)
        sessionStorage.setItem(groupKey, JSON.stringify(Object.fromEntries(live)));
      else sessionStorage.removeItem(groupKey);
    } catch {
      /* ignore */
    }
  }, [quantities, groupKey]);

  const setQuantity = useCallback((key: string, qty: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (!qty || qty <= 0) delete next[key];
      else next[key] = qty;
      return next;
    });
  }, []);

  const active = colours.find((c) => c.id === activeId);
  const isOriginal = activeId === product.id;

  const images = isOriginal
    ? product.images ?? []
    : active?.images?.length
    ? active.images
    : product.images ?? [];

  // The listing on screen: the page's own product, or a sibling shaped as a
  // full product so it prices and adds as itself.
  const activeProduct: Product = useMemo(
    () => (isOriginal || !active ? product : listingFor(product, active)),
    [product, active, isOriginal]
  );

  // The variant list for the colour on screen — its sizes, its stock.
  const variants: ProductVariant[] = activeProduct.variants ?? [];

  function pickColour(option: ColourOption) {
    setActiveId(option.id);
    // Keep the address bar honest without a navigation — a navigation would
    // remount this panel and throw away every other colour's quantities.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/product/${option.slug}`);
    }
  }

  const currentColour = isOriginal
    ? product.colourName
    : active?.colourName ?? null;

  /**
   * Totals across colours.
   *
   * Wholesale is earned per SIZE across the colour group, and the cart groups
   * by size *and* unit price, so the page mirrors that key exactly — otherwise
   * the page could promise a wholesale total the cart then declines to honour.
   */
  const summarise = useCallback(
    (working: Record<string, number>) => {
      const byGroup = new Map<string, number>();
      for (const [key, qty] of Object.entries(working)) {
        const entry = catalogue.get(key);
        if (!entry || qty <= 0) continue;
        const gk = priceGroupKey(entry);
        byGroup.set(gk, (byGroup.get(gk) ?? 0) + qty);
      }

      let units = 0;
      let cost = 0;
      let wholesaleApplied = false;
      let belowMin = 0;

      for (const [key, qty] of Object.entries(working)) {
        const entry = catalogue.get(key);
        if (!entry || qty <= 0) continue;
        const { retail, wholesale, wholesaleMin, minQty } = pricesOf(entry);
        const groupQty = byGroup.get(priceGroupKey(entry)) ?? qty;
        const atWholesale = wholesale != null && groupQty >= wholesaleMin;
        if (atWholesale) wholesaleApplied = true;
        if (qty < minQty) belowMin += 1;
        units += qty;
        cost += (atWholesale ? wholesale : retail) * qty;
      }

      return { units, cost, wholesaleApplied, belowMin };
    },
    [catalogue]
  );

  const summary = useMemo(() => summarise(quantities), [summarise, quantities]);

  /** Combined quantity counting toward this line's wholesale threshold. */
  const groupQtyFor = useCallback(
    (variant: ProductVariant) => {
      const entry = catalogue.get(variant.id);
      if (!entry) return quantities[variant.id] ?? 0;
      const key = priceGroupKey(entry);
      let total = 0;
      for (const [k, qty] of Object.entries(quantities)) {
        const e = catalogue.get(k);
        if (e && priceGroupKey(e) === key) total += qty;
      }
      return total;
    },
    [catalogue, quantities]
  );

  /** Units chosen against a given colour, for the chip bubble. */
  const unitsForColour = useCallback(
    (option: ColourOption) => {
      let total = 0;
      for (const [key, qty] of Object.entries(quantities)) {
        const entry = catalogue.get(key);
        if (entry?.listing.id === option.id) total += qty;
      }
      return total;
    },
    [catalogue, quantities]
  );

  /**
   * Add every colour's selection in one action.
   *
   * `extra` covers the sizeless panel, where the visible quantity box starts
   * at the minimum and may never be touched: what's on screen is added along
   * with whatever was stored against the other colours.
   */
  function addAll(extra?: { key: string; quantity: number }) {
    const working =
      extra && extra.quantity > 0
        ? { ...quantities, [extra.key]: extra.quantity }
        : quantities;

    const byListing = new Map<
      string,
      {
        product: Product;
        entries: { variant: ProductVariant; quantity: number }[];
        loose: number;
      }
    >();

    for (const [key, quantity] of Object.entries(working)) {
      const entry = catalogue.get(key);
      if (!entry || quantity <= 0) continue;
      const bucket = byListing.get(entry.listing.id) ?? {
        product: entry.listing,
        entries: [],
        loose: 0,
      };
      if (entry.variant) bucket.entries.push({ variant: entry.variant, quantity });
      else bucket.loose += quantity;
      byListing.set(entry.listing.id, bucket);
    }

    if (!byListing.size) return;

    let lines = 0;
    for (const { product: listing, entries, loose } of byListing.values()) {
      if (entries.length) {
        addMany(listing, entries);
        lines += entries.length;
      }
      if (loose > 0) {
        add(listing, loose);
        lines += 1;
      }
    }

    const { wholesaleApplied } = summarise(working);
    setQuantities({});
    toast(
      lines === 1
        ? wholesaleApplied
          ? "Added at the wholesale price"
          : "Added to cart"
        : `${lines} options added to cart${
            wholesaleApplied ? " at the wholesale price" : ""
          }`,
      { duration: 2000 }
    );
  }

  const usesVariants = variants.length > 0;

  const outOfStock = usesVariants
    ? !variants.some((v) => v.inStock)
    : activeProduct.inStock === false;

  const activeKey = listingKey(activeProduct.id);

  /**
   * For a sizeless listing: pieces chosen against the OTHER colours that count
   * toward the same wholesale threshold. The cart combines same-priced colours
   * in a group, so the panel has to as well or it quotes retail on an order
   * that will be charged at wholesale.
   */
  const othersInPriceGroup = useMemo(() => {
    const entry = catalogue.get(activeKey);
    if (!entry) return 0;
    const key = priceGroupKey(entry);
    let total = 0;
    for (const [k, qty] of Object.entries(quantities)) {
      if (k === activeKey) continue;
      const other = catalogue.get(k);
      if (other && priceGroupKey(other) === key) total += qty;
    }
    return total;
  }, [catalogue, quantities, activeKey]);

  return (
    <div className="grid animate-rise gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
      <ProductGallery
        images={images}
        name={currentColour ? `${product.name} — ${currentColour}` : product.name}
      />

      <div>
        {product.category && <p className="eyebrow">{product.category.name}</p>}
        <h1 className="display mt-2 text-3xl md:text-4xl">
          {stripColourSuffix(product.name)}
        </h1>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
          {outOfStock ? (
            <span className="text-faint">Currently out of stock</span>
          ) : (
            <span className="text-whatsapp">In stock</span>
          )}
          {product.badgeActive && product.badgeText && !outOfStock && (
            <>
              <span aria-hidden className="text-faint">·</span>
              <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-medium text-gold">
                {product.badgeText}
              </span>
            </>
          )}
        </p>

        {product.description && (
          <p className="mt-5 whitespace-pre-line leading-relaxed text-muted">
            {product.description}
          </p>
        )}

        {/* ---- colour switcher (sibling listings) ---- */}
        {colours.length > 1 && (
          <div className="mt-8">
            <p className="text-sm">
              <span className="font-semibold text-white">Colour:</span>{" "}
              <span className="text-muted">{currentColour ?? "—"}</span>
            </p>

            <div className="mt-3 flex flex-wrap gap-3 pr-2 pt-1">
              {colours.map((c) => {
                const selected = c.id === activeId;
                const pending = unitsForColour(c);
                const swatch = c.swatchMediaId
                  ? imageUrl(`/api/media/${c.swatchMediaId}`)
                  : null;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickColour(c)}
                    disabled={!c.inStock}
                    aria-pressed={selected}
                    title={c.inStock ? c.colourName ?? "" : `${c.colourName} — out of stock`}
                    className={`relative rounded-xl border-2 transition-all duration-150 ${
                      selected ? "border-white" : "border-ink-line hover:border-white/40"
                    } ${!c.inStock ? "cursor-not-allowed opacity-40" : ""} ${
                      swatch ? "h-14 w-14" : "px-4 py-2.5"
                    }`}
                  >
                    {swatch ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={swatch}
                        alt={c.colourName ?? ""}
                        className="h-full w-full rounded-[10px] object-cover"
                      />
                    ) : (
                      <span className="flex items-center gap-2 text-sm text-cloud">
                        {c.colourHex && (
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-white/20"
                            style={{ backgroundColor: c.colourHex }}
                            aria-hidden
                          />
                        )}
                        {c.colourName}
                      </span>
                    )}
                    {!c.inStock && (
                      <span className="absolute inset-0 grid place-items-center bg-ink/70 text-[10px] uppercase tracking-wide text-faint">
                        Sold out
                      </span>
                    )}
                    {/* Pending quantity for this colour, so a customer can see
                        at a glance that switching hasn't lost their choice. */}
                    {pending > 0 && (
                      <span
                        className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-whatsapp px-1.5 text-[10px] font-bold text-ink"
                        aria-label={`${pending} pcs chosen in ${c.colourName ?? "this colour"}`}
                      >
                        {pending}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {usesVariants ? (
          <VariantSelector
            product={activeProduct}
            variants={variants}
            quantities={quantities}
            onQuantityChange={setQuantity}
            groupQtyFor={groupQtyFor}
            onAdd={() => addAll()}
            summary={summary}
          />
        ) : (
          <AddToCartPanel
            product={activeProduct}
            quantity={quantities[activeKey]}
            onQuantityChange={(n) => setQuantity(activeKey, n)}
            onAdd={(qty) => addAll({ key: activeKey, quantity: qty })}
            othersSelected={summary.units - (quantities[activeKey] ?? 0)}
            othersInPriceGroup={othersInPriceGroup}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

/** A sizeless listing is its own line; namespaced so it can't collide with a variant id. */
function listingKey(productId: string) {
  return `listing:${productId}`;
}

/** A sibling colour, shaped as a full product — with its own prices, not the page's. */
function listingFor(product: Product, c: ColourOption): Product {
  return {
    ...product,
    id: c.id,
    slug: c.slug,
    name: c.name ?? product.name,
    colourName: c.colourName,
    variants: c.variants,
    images: c.images,
    inStock: c.inStock,
    hasVariants: c.hasVariants ?? product.hasVariants,
    retailPrice: c.retailPrice ?? product.retailPrice,
    wholesalePrice: c.wholesalePrice ?? product.wholesalePrice,
    retailMinQty: c.retailMinQty ?? product.retailMinQty,
    wholesaleMinQty: c.wholesaleMinQty ?? product.wholesaleMinQty,
    effectivePrice: c.effectivePrice ?? product.effectivePrice,
    effectiveWholesalePrice:
      c.effectiveWholesalePrice ?? product.effectiveWholesalePrice,
  };
}

/** Prices and floors for a line, whether it's a size or a whole listing. */
function pricesOf(entry: { listing: Product; variant: ProductVariant | null }) {
  const { listing, variant } = entry;
  return {
    retail: variant
      ? variant.retailPrice
      : listing.effectivePrice ?? listing.retailPrice,
    wholesale: variant
      ? variant.wholesalePrice ?? null
      : listing.effectiveWholesalePrice ?? listing.wholesalePrice ?? null,
    wholesaleMin: Math.max(1, listing.wholesaleMinQty ?? 1),
    minQty: Math.max(1, listing.retailMinQty ?? 1),
  };
}

/**
 * What a line's quantity counts toward for wholesale — size plus price, which
 * is the cart's own grouping. Colours combine; different sizes don't.
 */
function priceGroupKey(entry: { listing: Product; variant: ProductVariant | null }) {
  const { retail } = pricesOf(entry);
  return `${entry.variant?.size ?? ""}::${retail}`;
}

/** "Poly Mailers — White" reads as "Poly Mailers" once colour is a switcher. */
function stripColourSuffix(name: string) {
  return name.split(" — ")[0];
}

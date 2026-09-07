"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
 * Colours are separate listings that share a group, so switching colour is a
 * real navigation — each colour has its own URL, its own photos and its own
 * SEO. The switch happens instantly in the UI (the sibling's images and sizes
 * arrived with the page) and the URL is updated underneath, so it feels like a
 * selector while still being a distinct, linkable page.
 */
export function ProductBuyPanel({ product }: { product: Product }) {
  const router = useRouter();

  const colours = useMemo(
    () =>
      (product.colourOptions ?? [])
        .slice()
        .sort((a, b) => (a.groupPosition ?? 0) - (b.groupPosition ?? 0)),
    [product.colourOptions]
  );

  const { addMany } = useCart();
  const { toast } = useToast();

  // Which sibling is showing. Starts on the listing that was actually
  // requested, so a direct link to the white page opens on white.
  const [activeId, setActiveId] = useState<string>(product.id);

  /**
   * Quantities for EVERY colour, keyed by variant id, held here rather than in
   * the selector.
   *
   * Switching colour used to remount the selector and wipe what had been typed,
   * which is punishing when wholesale is earned across colours — the exact
   * shopper the pricing rewards was the one losing their work. Keeping it here
   * means a customer can put 60 into black, switch to pink, add 60 more, and
   * add the lot in one go at the wholesale rate.
   */
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  function setQuantity(variantId: string, qty: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (!qty || qty <= 0) delete next[variantId];
      else next[variantId] = qty;
      return next;
    });
  }
  const active = colours.find((c) => c.id === activeId);
  const isOriginal = activeId === product.id;

  const images = isOriginal
    ? product.images ?? []
    : active?.images?.length
    ? active.images
    : product.images ?? [];

  // The variant list for the colour on screen — its sizes, its stock.
  const variants: ProductVariant[] = isOriginal
    ? product.variants ?? []
    : active?.variants ?? [];

  // A synthetic product for the selector, so it prices and adds against the
  // sibling listing rather than the one the page was rendered from.
  const activeProduct: Product = useMemo(() => {
    if (isOriginal || !active) return product;
    return {
      ...product,
      id: active.id,
      slug: active.slug,
      colourName: active.colourName,
      variants: active.variants,
      images: active.images,
      inStock: active.inStock,
    };
  }, [product, active, isOriginal]);

  function pickColour(option: ColourOption | null) {
    const id = option?.id ?? product.id;
    setActiveId(id);
    const slug = option?.slug ?? product.slug;
    // Keep the address bar honest without a full page load.
    router.replace(`/product/${slug}`, { scroll: false });
  }

  const currentColour = isOriginal
    ? product.colourName
    : active?.colourName ?? null;

  /** Every variant across every colour, so totals and adding can see them all. */
  const allVariants = useMemo(() => {
    const map = new Map<string, { variant: ProductVariant; listing: Product }>();
    for (const v of product.variants ?? []) map.set(v.id, { variant: v, listing: product });
    for (const c of colours) {
      const listing: Product = {
        ...product,
        id: c.id,
        slug: c.slug,
        colourName: c.colourName,
        variants: c.variants,
        images: c.images,
        inStock: c.inStock,
      };
      for (const v of c.variants ?? []) map.set(v.id, { variant: v, listing });
    }
    return map;
  }, [product, colours]);

  const wholesaleMin = Math.max(1, product.wholesaleMinQty ?? 1);

  /**
   * Totals across colours. Wholesale is earned per SIZE across colours, so the
   * qualifying quantity is summed by size before pricing each line — that's
   * what makes 60 black + 60 pink of one size reach a 100 threshold.
   */
  const summary = useMemo(() => {
    const bySize = new Map<string, number>();
    for (const [id, qty] of Object.entries(quantities)) {
      const entry = allVariants.get(id);
      if (!entry) continue;
      const key = entry.variant.size ?? "";
      bySize.set(key, (bySize.get(key) ?? 0) + qty);
    }

    let units = 0;
    let cost = 0;
    let wholesaleApplied = false;

    for (const [id, qty] of Object.entries(quantities)) {
      const entry = allVariants.get(id);
      if (!entry) continue;
      const sizeQty = bySize.get(entry.variant.size ?? "") ?? qty;
      const wholesale =
        entry.variant.wholesalePrice != null && sizeQty >= wholesaleMin;
      if (wholesale) wholesaleApplied = true;
      units += qty;
      cost +=
        (wholesale ? entry.variant.wholesalePrice! : entry.variant.retailPrice) * qty;
    }
    return { units, cost, wholesaleApplied };
  }, [quantities, allVariants, wholesaleMin]);

  /** Units chosen against a given colour, for the chip bubble. */
  function unitsForColour(option: ColourOption | null) {
    const list = option ? option.variants ?? [] : product.variants ?? [];
    return list.reduce((n, v) => n + (quantities[v.id] ?? 0), 0);
  }

  /** Add every colour's selection in one action. */
  function addAll() {
    const byListing = new Map<string, { product: Product; entries: { variant: ProductVariant; quantity: number }[] }>();

    for (const [id, quantity] of Object.entries(quantities)) {
      const entry = allVariants.get(id);
      if (!entry || quantity <= 0) continue;
      const bucket = byListing.get(entry.listing.id) ?? {
        product: entry.listing,
        entries: [],
      };
      bucket.entries.push({ variant: entry.variant, quantity });
      byListing.set(entry.listing.id, bucket);
    }

    if (!byListing.size) return;
    for (const { product: listing, entries } of byListing.values())
      addMany(listing, entries);

    const lines = [...byListing.values()].reduce((n, b) => n + b.entries.length, 0);
    setQuantities({});
    toast(lines === 1 ? "Added to cart" : `${lines} options added to cart`, {
      duration: 2000,
    });
  }

  const usesVariants =
    (activeProduct.hasVariants && (variants?.length ?? 0) > 0) || variants.length > 0;

  const outOfStock = usesVariants
    ? !variants.some((v) => v.inStock)
    : activeProduct.inStock === false;

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
                const pending = unitsForColour(c.id === product.id ? null : c);
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
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-whatsapp px-1.5 text-[10px] font-bold text-ink">
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
            onAdd={addAll}
            summary={summary}
          />
        ) : (
          <AddToCartPanel product={activeProduct} />
        )}
      </div>
    </div>
  );
}

/** "Poly Mailers — White" reads as "Poly Mailers" once colour is a switcher. */
function stripColourSuffix(name: string) {
  return name.split(" — ")[0];
}

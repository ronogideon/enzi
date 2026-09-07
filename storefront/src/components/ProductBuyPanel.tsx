"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColourOption, Product, ProductVariant } from "@/lib/types";
import { ProductGallery } from "./ProductGallery";
import { VariantSelector } from "./VariantSelector";
import { AddToCartPanel } from "./AddToCartPanel";
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

  // Which sibling is showing. Starts on the listing that was actually
  // requested, so a direct link to the white page opens on white.
  const [activeId, setActiveId] = useState<string>(product.id);
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

            <div className="mt-3 flex flex-wrap gap-2">
              {colours.map((c) => {
                const selected = c.id === activeId;
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
                    className={`relative overflow-hidden rounded-xl border-2 transition-all duration-150 ${
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
                        className="h-full w-full object-cover"
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
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {usesVariants ? (
          <VariantSelector
            key={activeProduct.id}
            product={activeProduct}
            variants={variants}
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

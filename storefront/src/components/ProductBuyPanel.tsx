"use client";

import { useState } from "react";
import type { Product, ProductVariant } from "@/lib/types";
import { ProductGallery } from "./ProductGallery";
import { VariantSelector } from "./VariantSelector";
import { AddToCartPanel } from "./AddToCartPanel";

/**
 * Ties the gallery to the variant selection.
 *
 * Both need to move together — picking "White" should show the white photos —
 * so they share state here rather than each fetching or guessing. Products
 * without variants fall through to the original simple panel unchanged.
 */
export function ProductBuyPanel({ product }: { product: Product }) {
  const [variant, setVariant] = useState<ProductVariant | null>(
    () => (product.variants ?? []).find((v) => v.inStock) ?? product.variants?.[0] ?? null
  );

  const allImages = product.images ?? [];

  // Photos tagged to the selected colour, if any exist. Falling back to the
  // full set matters: a shop that hasn't tagged photos per colour yet still
  // gets a working gallery instead of an empty frame.
  const variantImages = variant
    ? allImages.filter((im) => im.variantId === variant.id)
    : [];
  const galleryImages = variantImages.length ? variantImages : allImages;

  const usesVariants = product.hasVariants && (product.variants?.length ?? 0) > 0;

  return (
    <div className="grid animate-rise gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
      <ProductGallery
        images={galleryImages}
        name={
          variant?.colour ? `${product.name} — ${variant.colour}` : product.name
        }
      />

      <div>
        <ProductHeading product={product} />
        {usesVariants ? (
          <VariantSelector product={product} onVariantChange={setVariant} />
        ) : (
          <AddToCartPanel product={product} />
        )}
      </div>
    </div>
  );
}

function ProductHeading({ product }: { product: Product }) {
  const outOfStock = product.hasVariants
    ? !(product.variants ?? []).some((v) => v.inStock)
    : product.inStock === false;

  return (
    <>
      {product.category && (
        <p className="eyebrow">{product.category.name}</p>
      )}
      <h1 className="display mt-2 text-3xl md:text-4xl">{product.name}</h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
        {outOfStock ? (
          <span className="text-faint">Currently out of stock</span>
        ) : (
          <span className="text-whatsapp">In stock</span>
        )}
        {/* The shop's own urgency line — never a stock number. */}
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
    </>
  );
}

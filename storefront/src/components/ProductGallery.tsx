"use client";

import { useEffect, useState } from "react";
import { imageUrl } from "@/lib/api";
import type { ProductImage } from "@/lib/types";

/**
 * Multi-photo gallery.
 *
 * Sizing: on desktop the image is height-constrained rather than a square that
 * grows with the column width. A full-width square in a two-column layout is
 * easily 700px tall, which pushes the price and the add-to-cart button below
 * the fold — you shouldn't have to scroll to buy something. Capping at 58vh
 * keeps the whole buying decision on one screen. On mobile the column is narrow
 * enough that a square is already the right shape, so it stays square there.
 *
 * `object-contain` on a padded surface rather than `object-cover`, because
 * packaging photos arrive in whatever aspect the shop shot them in and cropping
 * a product to fill a frame can cut off the thing being sold.
 */
export function ProductGallery({
  images,
  name,
}: {
  images: ProductImage[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const current = images[active] ?? images[0];

  // Reset the fade whenever the shown photo changes, so each swap gets its own
  // gentle arrival rather than snapping in.
  useEffect(() => setLoaded(false), [active]);

  // Arrow keys move through photos once the gallery has been touched — cheap to
  // support, and the sort of thing that makes a page feel finished.
  useEffect(() => {
    if (images.length < 2) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setActive((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft") setActive((i) => (i - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  if (!images.length) {
    return (
      <div className="card grid aspect-square place-items-center lg:aspect-auto lg:h-[min(58vh,560px)]">
        <span className="text-sm text-faint">No photo yet</span>
      </div>
    );
  }

  return (
    <div className="lg:sticky lg:top-24">
      <div className="card animate-fade grid aspect-square place-items-center overflow-hidden p-3 lg:aspect-auto lg:h-[min(58vh,560px)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.url}
          src={imageUrl(current.url)}
          alt={current.alt ?? name}
          onLoad={() => setLoaded(true)}
          data-loaded={loaded}
          className="img-in max-h-full max-w-full rounded-lg object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id ?? `${img.url}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className={`card h-16 w-16 shrink-0 overflow-hidden p-1 transition-all duration-200 ${
                i === active
                  ? "opacity-100 ring-1 ring-white/50"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(img.url)}
                alt=""
                loading="lazy"
                className="h-full w-full rounded object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { SmartImage } from "./ui";
import type { ProductImage } from "@/lib/types";

/**
 * Multi-photo gallery. The old page rendered the first image plus four dead
 * thumbnails — clicking one did nothing. Here the thumbnails actually swap the
 * main image, which is the whole point of letting the shop upload several
 * angles of a product.
 */
export function ProductGallery({
  images,
  name,
}: {
  images: ProductImage[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div>
      <div className="card overflow-hidden">
        <SmartImage
          src={current?.url}
          alt={current?.alt ?? name}
          className="aspect-square w-full object-cover"
        />
      </div>

      {images.length > 1 && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {images.map((img, i) => (
            <button
              key={img.id ?? `${img.url}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className={`card overflow-hidden transition-opacity ${
                i === active ? "ring-1 ring-white/50" : "opacity-70 hover:opacity-100"
              }`}
            >
              <SmartImage
                src={img.url}
                alt={img.alt ?? `${name} photo ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

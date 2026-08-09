"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { useCart } from "@/lib/cart";

export function AddToCartPanel({ product }: { product: Product }) {
  const { add, tier } = useCart();
  const min = tier === "WHOLESALE" ? product.wholesaleMinQty : product.retailMinQty;
  const [qty, setQty] = useState(min);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(product, Math.max(qty, min));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  const out = product.stockQty <= 0;

  return (
    <div className="mt-8">
      {min > 1 && (
        <p className="mb-3 text-sm text-faint">
          Minimum order quantity: <span className="text-cloud">{min}</span>
        </p>
      )}
      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-full border border-ink-line">
          <button
            onClick={() => setQty((q) => Math.max(min, q - 1))}
            className="grid h-11 w-11 place-items-center text-lg text-muted hover:text-cloud"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            value={qty}
            onChange={(e) => setQty(Math.max(min, parseInt(e.target.value) || min))}
            className="w-12 bg-transparent text-center text-cloud focus:outline-none"
            aria-label="Quantity"
          />
          <button
            onClick={() => setQty((q) => q + 1)}
            className="grid h-11 w-11 place-items-center text-lg text-muted hover:text-cloud"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button onClick={handleAdd} disabled={out} className="btn-primary flex-1 sm:flex-none sm:px-10">
          {out ? "Out of stock" : added ? "Added ✓" : "Add to cart"}
        </button>
      </div>

      <div className="mt-4">
        <Link href="/cart" className="text-sm text-muted underline-offset-4 hover:text-cloud hover:underline">
          Go to cart →
        </Link>
      </div>
    </div>
  );
}

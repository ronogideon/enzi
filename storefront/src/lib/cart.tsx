"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product, ProductVariant } from "./types";

export interface CartItem {
  /** Unique per product+variant — a line, not a product. */
  key: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  slug: string;
  name: string;
  unitPrice: number; // retail price snapshot for display (cents)
  quantity: number;
  imageUrl?: string | null;
  minQty: number;
}

interface CartState {
  items: CartItem[];
  count: number;
  add: (product: Product, qty?: number, variant?: ProductVariant | null) => void;
  /** Add several variants of one product at once — the size grid does this. */
  addMany: (
    product: Product,
    entries: { variant: ProductVariant; quantity: number }[]
  ) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);
// v2: lines are now keyed by product+variant, so an old v1 cart can't be
// read safely. Bumping the key discards it rather than half-migrating it.
const STORAGE_KEY = "enzi.cart.v2";

/** Stable identity for a cart line. */
function lineKey(productId: string, variantId?: string | null) {
  return variantId ? `${productId}:${variantId}` : productId;
}

function labelFor(variant?: ProductVariant | null) {
  if (!variant) return null;
  return [variant.colour, variant.size].filter(Boolean).join(" / ") || null;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(parsed.items ?? []);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
  }, [items, hydrated]);

  function buildItem(
    product: Product,
    quantity: number,
    variant?: ProductVariant | null
  ): CartItem {
    const minQty = product.retailMinQty ?? 1;
    // A variant's own image if it has one, so the cart row shows the colour
    // actually bought rather than whatever the product's first photo is.
    const image =
      product.images?.find((im) => im.variantId && im.variantId === variant?.id)?.url ??
      product.images?.[0]?.url ??
      null;

    return {
      key: lineKey(product.id, variant?.id),
      productId: product.id,
      variantId: variant?.id ?? null,
      variantLabel: labelFor(variant),
      slug: product.slug,
      name: product.name,
      unitPrice: variant?.retailPrice ?? product.effectivePrice ?? product.retailPrice,
      quantity,
      imageUrl: image,
      minQty,
    };
  }

  function add(product: Product, qty?: number, variant?: ProductVariant | null) {
    const minQty = product.retailMinQty ?? 1;
    const addQty = qty ?? minQty; // start at the min so the floor is honest up front
    const key = lineKey(product.id, variant?.id);

    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing)
        return prev.map((i) =>
          i.key === key ? { ...i, quantity: i.quantity + addQty } : i
        );
      return [...prev, buildItem(product, addQty, variant)];
    });
  }

  /**
   * Add several variants in one action. The product page lets someone put a
   * quantity against each size and add them together, so this merges the whole
   * batch in a single state update rather than a sequence that could drop
   * entries to stale closures.
   */
  function addMany(
    product: Product,
    entries: { variant: ProductVariant; quantity: number }[]
  ) {
    const usable = entries.filter((e) => e.quantity > 0);
    if (!usable.length) return;

    setItems((prev) => {
      const next = [...prev];
      for (const { variant, quantity } of usable) {
        const key = lineKey(product.id, variant.id);
        const idx = next.findIndex((i) => i.key === key);
        if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        else next.push(buildItem(product, quantity, variant));
      }
      return next;
    });
  }

  function setQty(key: string, qty: number) {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, quantity: qty } : i)).filter((i) => i.quantity > 0)
    );
  }

  const remove = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clear = () => setItems([]);

  const count = useMemo(() => items.reduce((n, i) => n + i.quantity, 0), [items]);

  const value: CartState = { items, count, add, addMany, setQty, remove, clear };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

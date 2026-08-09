"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product, Tier } from "./types";

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  unitPrice: number; // retail price snapshot for display (cents)
  quantity: number;
  imageUrl?: string | null;
  minQty: number;
}

interface CartState {
  items: CartItem[];
  tier: Tier;
  count: number;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setTier: (tier: Tier) => void;
}

const CartContext = createContext<CartState | null>(null);
const STORAGE_KEY = "enzi.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [tier, setTier] = useState<Tier>("RETAIL");
  const [hydrated, setHydrated] = useState(false);

  // hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(parsed.items ?? []);
        setTier(parsed.tier ?? "RETAIL");
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // persist
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, tier }));
  }, [items, tier, hydrated]);

  function add(product: Product, qty?: number) {
    const minQty = product.retailMinQty ?? 1;
    const addQty = qty ?? minQty; // start at the min so the floor is honest up front
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + addQty }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          unitPrice: product.effectivePrice ?? product.retailPrice,
          quantity: addQty,
          imageUrl: product.images?.[0]?.url ?? null,
          minQty,
        },
      ];
    });
  }

  function setQty(productId: string, qty: number) {
    setItems((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, quantity: qty } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  const remove = (productId: string) =>
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  const clear = () => setItems([]);

  const count = useMemo(
    () => items.reduce((n, i) => n + i.quantity, 0),
    [items]
  );

  const value: CartState = {
    items,
    tier,
    count,
    add,
    setQty,
    remove,
    clear,
    setTier,
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

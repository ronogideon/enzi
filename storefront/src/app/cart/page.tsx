"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { SmartImage } from "@/components/ui";
import type { PricedCart } from "@/lib/types";

export default function CartPage() {
  const { items, setQty, remove } = useCart();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(false);

  // Re-price whenever the items change. The server decides retail vs wholesale
  // per line from the quantity, so there is nothing for the shopper to choose.
  useEffect(() => {
    if (items.length === 0) {
      setPriced(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .priceCart(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))
      .then((res) => !cancelled && setPriced(res))
      .catch(() => !cancelled && setPriced(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="shell py-24">
        <div className="card mx-auto grid max-w-lg place-items-center px-6 py-20 text-center">
          <p className="font-display text-2xl text-white">Your cart is empty</p>
          <p className="mt-2 text-sm text-muted">
            Add some packaging and it’ll show up here.
          </p>
          <Link href="/shop" className="btn-primary mt-6 px-8">
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  const bumped = priced?.lines.filter((l) => l.bumped) ?? [];
  const subtotal = priced?.subtotal ?? items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div className="shell py-12">
      <div className="mb-8">
        <h1 className="display animate-rise text-3xl md:text-4xl">Your cart</h1>
      </div>

      {bumped.length > 0 && (
        <div className="animate-rise mb-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          Quantities raised to the minimum order for:{" "}
          {bumped.map((b) => b.name).join(", ")}.
        </div>
      )}

      {/* Wholesale is applied automatically, so say so — otherwise a lower
          price than expected just looks like a bug. */}
      {(priced?.wholesaleSaving ?? 0) > 0 && (
        <div className="animate-rise mb-6 rounded-xl border border-whatsapp/30 bg-whatsapp/10 px-4 py-3 text-sm text-whatsapp">
          Wholesale pricing applied — you're saving{" "}
          <span className="font-semibold">{formatKes(priced!.wholesaleSaving)}</span> on
          this order.
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* lines */}
        <div className="stagger space-y-4">
          {items.map((item) => {
            const line = priced?.lines.find((l) => l.productId === item.productId);
            const unit = line?.unitPrice ?? item.unitPrice;
            const lineTotal = line?.lineTotal ?? unit * item.quantity;
            return (
              <div key={item.productId} className="card flex gap-4 p-4">
                <Link href={`/product/${item.slug}`} className="shrink-0">
                  <SmartImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-24 w-24 rounded-xl object-cover"
                  />
                </Link>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      href={`/product/${item.slug}`}
                      className="font-display font-bold text-white hover:text-white"
                    >
                      {item.name}
                    </Link>
                    <button
                      onClick={() => remove(item.productId)}
                      className="text-sm text-faint hover:text-red-400"
                      aria-label={`Remove ${item.name}`}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-muted">{formatKes(unit)} each</p>

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center rounded-full border border-ink-line">
                      <button
                        onClick={() => setQty(item.productId, Math.max(1, item.quantity - 1))}
                        className="grid h-9 w-9 place-items-center text-muted hover:text-cloud"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm text-cloud">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => setQty(item.productId, item.quantity + 1)}
                        className="grid h-9 w-9 place-items-center text-muted hover:text-cloud"
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-semibold text-white">
                      {formatKes(lineTotal)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* summary */}
        <aside className="h-fit lg:sticky lg:top-28">
          <div className="card p-6">
            <p className="font-display text-lg font-bold text-white">
              Order summary
            </p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">
                Subtotal {loading && <span className="text-faint">· updating…</span>}
              </span>
              <span className="text-cloud">{formatKes(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">Delivery</span>
              <span className="text-faint">Chosen at checkout</span>
            </div>
            <div className="mt-4 border-t border-ink-line pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-white">Total</span>
                <span className="font-display text-xl font-bold text-white">
                  {formatKes(subtotal)}
                </span>
              </div>
              <p className="mt-1 text-xs text-faint">+ delivery</p>
            </div>
            <Link href="/checkout" className="btn-primary mt-6 w-full">
              Proceed to checkout
            </Link>
            <Link
              href="/shop"
              className="mt-3 block text-center text-sm text-muted hover:text-cloud"
            >
              Continue shopping
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

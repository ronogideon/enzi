"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { DeliveryMethod, PricedCart } from "@/lib/types";

type Phase = "form" | "paying" | "pending";

function normalizePhone(input: string): string {
  let p = input.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}
const validPhone = (p: string) => /^254(7|1)\d{8}$/.test(normalizePhone(p));

export default function CheckoutPage() {
  const router = useRouter();
  const { items, tier, clear } = useCart();

  const [methods, setMethods] = useState<DeliveryMethod[]>([]);
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [methodId, setMethodId] = useState<string>("");
  const [payNow, setPayNow] = useState(false); // for POD-eligible methods
  const [form, setForm] = useState({ name: "", phone: "", email: "", details: "" });

  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);

  // load delivery methods + price the cart
  useEffect(() => {
    api.deliveryMethods().then((m) => {
      setMethods(m);
      if (m.length) setMethodId((id) => id || m[0].id);
    });
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    api
      .priceCart(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        tier
      )
      .then(setPriced)
      .catch(() => setPriced(null));
  }, [items, tier]);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const podEligible =
    !!method &&
    method.podAllowed &&
    method.type !== "PARCEL" &&
    method.type !== "PICKUP_MTAANI";
  // non-POD methods must pay now; POD methods default to pay-on-delivery
  const willPayNow = !podEligible || payNow;

  const subtotal = priced?.subtotal ?? 0;
  const deliveryFee = method?.baseCost ?? 0;
  const total = subtotal + deliveryFee;
  const needsAddress = method?.type === "DELIVERY";

  const canSubmit = useMemo(
    () =>
      items.length > 0 &&
      form.name.trim().length > 1 &&
      validPhone(form.phone) &&
      !!methodId &&
      (!needsAddress || form.details.trim().length > 3),
    [items.length, form, methodId, needsAddress]
  );

  async function submit() {
    setError(null);
    try {
      const { order, requiresPayment } = await api.placeOrder({
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        email: form.email.trim() || undefined,
        tier,
        lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryMethodId: methodId,
        deliveryDetails: form.details.trim()
          ? { note: form.details.trim() }
          : undefined,
      });

      // Pay-on-delivery path (POD method, customer didn't choose pay-now):
      // order is already CONFIRMED — straight to the receipt.
      if (!requiresPayment && !willPayNow) {
        clear();
        router.push(`/order/${order.orderNumber}`);
        return;
      }

      // Pay-now path: fire the STK push and wait for the callback.
      setPhase("paying");
      const stk = await api.initiateStk(order.id, normalizePhone(form.phone));
      setCheckoutRequestId(stk.checkoutRequestId);
      pollStatus(stk.checkoutRequestId, order.orderNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("form");
    }
  }

  function pollStatus(id: string, orderNumber: string) {
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const res = await api.paymentStatus(id);
        if (res.isPaid || res.status === "PAID") {
          clearInterval(timer);
          clear();
          router.push(`/order/${orderNumber}`);
          return;
        }
        if (res.status === "FAILED") {
          clearInterval(timer);
          setError("Payment failed or was cancelled. You can try again.");
          setPhase("form");
          return;
        }
      } catch {
        /* keep polling */
      }
      if (tries >= 20) {
        clearInterval(timer);
        setPhase("pending"); // give them a manual way forward
      }
    }, 3000);
  }

  if (items.length === 0 && phase === "form") {
    return (
      <div className="shell py-24 text-center">
        <p className="font-display text-2xl text-white">Your cart is empty</p>
        <Link href="/shop" className="btn-primary mt-6 inline-flex px-8">
          Browse products
        </Link>
      </div>
    );
  }

  // --- STK waiting screen ---
  if (phase === "paying" || phase === "pending") {
    return (
      <div className="shell py-24">
        <div className="card mx-auto max-w-lg p-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-indigo/40">
            {phase === "paying" ? (
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
            ) : (
              <span className="text-2xl">⏳</span>
            )}
          </div>
          <h1 className="display mt-6 text-2xl">
            {phase === "paying" ? "Check your phone" : "Still waiting"}
          </h1>
          <p className="mt-3 text-muted">
            {phase === "paying" ? (
              <>
                We’ve sent an M-Pesa prompt to{" "}
                <span className="text-cloud">{normalizePhone(form.phone)}</span>.
                Enter your PIN to pay {formatKes(total)}.
              </>
            ) : (
              <>
                We haven’t seen the payment yet. If you completed it, your order
                is safe — check its status below.
              </>
            )}
          </p>
          {phase === "pending" && checkoutRequestId && (
            <button
              onClick={() => {
                setPhase("paying");
                pollStatus(checkoutRequestId, "");
              }}
              className="btn-ghost mt-6"
            >
              Check again
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- checkout form ---
  return (
    <div className="shell py-12">
      <h1 className="display text-3xl md:text-4xl">Checkout</h1>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* details */}
        <div className="space-y-8">
          <section>
            <p className="eyebrow mb-4">Your details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="field"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="field"
                placeholder="M-Pesa phone (07…)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className="field sm:col-span-2"
                placeholder="Email (optional)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </section>

          <section>
            <p className="eyebrow mb-4">Delivery method</p>
            <div className="space-y-3">
              {methods.map((m) => {
                const eligible =
                  m.podAllowed &&
                  m.type !== "PARCEL" &&
                  m.type !== "PICKUP_MTAANI";
                return (
                  <label
                    key={m.id}
                    className={`card flex cursor-pointer items-center gap-4 p-4 ${
                      methodId === m.id ? "border-white/40" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      checked={methodId === m.id}
                      onChange={() => {
                        setMethodId(m.id);
                        setPayNow(false);
                      }}
                      className="accent-white"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{m.name}</span>
                        {eligible ? (
                          <span className="rounded-full border border-whatsapp/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-whatsapp">
                            Pay on delivery
                          </span>
                        ) : (
                          <span className="rounded-full border border-ink-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint">
                            Pay now
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p className="text-xs text-muted">{m.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-cloud">
                      {m.baseCost === 0 ? "Free" : formatKes(m.baseCost)}
                    </span>
                  </label>
                );
              })}
            </div>

            {needsAddress && (
              <textarea
                className="field mt-4 min-h-24"
                placeholder="Delivery address / location details"
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
              />
            )}

            {/* POD-eligible → let them optionally pay now */}
            {podEligible && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setPayNow(false)}
                  className={`btn flex-1 border ${
                    !payNow ? "border-white/40 text-white" : "border-ink-line text-muted"
                  }`}
                >
                  Pay on delivery
                </button>
                <button
                  onClick={() => setPayNow(true)}
                  className={`btn flex-1 border ${
                    payNow ? "border-white/40 text-white" : "border-ink-line text-muted"
                  }`}
                >
                  Pay now with M-Pesa
                </button>
              </div>
            )}
          </section>
        </div>

        {/* summary */}
        <aside className="h-fit lg:sticky lg:top-28">
          <div className="card p-6">
            <p className="font-display text-lg font-bold text-white">
              Order summary
            </p>
            <div className="mt-4 space-y-2 text-sm">
              {(priced?.lines ?? []).map((l) => (
                <div key={l.productId} className="flex justify-between gap-4">
                  <span className="text-muted">
                    {l.name} × {l.quantity}
                    {l.bumped && <span className="text-gold"> (min)</span>}
                  </span>
                  <span className="text-cloud">{formatKes(l.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-ink-line pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="text-cloud">{formatKes(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Delivery</span>
                <span className="text-cloud">
                  {deliveryFee === 0 ? "Free" : formatKes(deliveryFee)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-ink-line pt-4">
              <span className="font-medium text-white">Total</span>
              <span className="font-display text-xl font-bold text-white">
                {formatKes(total)}
              </span>
            </div>

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="btn-primary mt-6 w-full"
            >
              {willPayNow ? `Pay ${formatKes(total)}` : "Place order"}
            </button>
            <p className="mt-3 text-center text-xs text-faint">
              {willPayNow
                ? "You’ll get an M-Pesa prompt to confirm."
                : "Reserve now, pay when your order arrives."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

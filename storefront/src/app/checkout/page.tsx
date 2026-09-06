"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef } from "react";
import { useCart } from "@/lib/cart";
import { useAccount, normalizePhone, isValidPhone as validPhone } from "@/lib/account";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { DeliveryMethod, PricedCart } from "@/lib/types";

type Phase = "form" | "paying";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clear } = useCart();
  const { customer, ready: accountReady } = useAccount();

  const [methods, setMethods] = useState<DeliveryMethod[]>([]);
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [methodId, setMethodId] = useState<string>("");
  const [zoneId, setZoneId] = useState<string>("");
  const [zoneSearch, setZoneSearch] = useState("");
  const [payNow, setPayNow] = useState(false); // for POD-eligible methods
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    details: "",
    // Optional extras — a building name, a gate, an alternative number.
    instructions: "",
  });

  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const currentOrderNumber = useRef<string>("");

  /**
   * Idempotency key for THIS attempt.
   *
   * The previous version persisted one fixed key in sessionStorage and only
   * cleared it on the pay-on-delivery path — so after any successful order the
   * stale key lived on, and every later checkout reused it, hit the already-paid
   * order, and showed "Order already paid". A new account didn't help because
   * sessionStorage is per-browser, not per-user.
   *
   * Now the key is generated fresh each time the checkout screen mounts. It
   * still protects against the real double-submit (a double-tap, or the STK
   * being fired twice in one sitting) because it's held in a ref for the life
   * of the mounted page — but it does NOT survive to poison the next order.
   */
  const idempotencyKey = useRef<string>(
    `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  );
  const [prefilled, setPrefilled] = useState(false);
  const [existingAccount, setExistingAccount] = useState<{ name: string | null } | null>(null);

  // Autofill from the signed-in account. Runs once, so it never fights with
  // someone deliberately ordering on behalf of a colleague.
  useEffect(() => {
    if (!accountReady || !customer || prefilled) return;
    setForm((f) => ({
      ...f,
      name: f.name || customer.name || "",
      phone: f.phone || customer.phone || "",
      email: f.email || customer.email || "",
    }));
    setPrefilled(true);
  }, [accountReady, customer, prefilled]);

  /**
   * If a guest types a number that already has an account, say so rather than
   * letting them re-enter details they have already saved. Purely a nudge —
   * guest checkout still works exactly as before.
   */
  useEffect(() => {
    if (customer || !validPhone(form.phone)) {
      setExistingAccount(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .checkPhone(form.phone)
        .then((r) => {
          if (!cancelled) setExistingAccount(r.hasLogin ? { name: r.name } : null);
        })
        .catch(() => undefined);
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.phone, customer]);

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
        items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
      )
      .then(setPriced)
      .catch(() => setPriced(null));
  }, [items]);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const zones = (method?.zones ?? [])
    .filter((z) => z.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
  const zone = zones.find((z) => z.id === zoneId) ?? null;

  const zoneQuery = zoneSearch.trim().toLowerCase();
  const visibleZones = zoneQuery
    ? zones.filter(
        (z) =>
          z.name.toLowerCase().includes(zoneQuery) ||
          (z.description ?? "").toLowerCase().includes(zoneQuery)
      )
    : zones;
  const podEligible =
    !!method &&
    method.podAllowed &&
    method.type !== "PARCEL" &&
    method.type !== "PICKUP_MTAANI";
  // non-POD methods must pay now; POD methods default to pay-on-delivery
  const willPayNow = !podEligible || payNow;

  const subtotal = priced?.subtotal ?? 0;
  /**
   * A zone's price replaces the method's flat cost, and a per-zone threshold
   * can waive it. The server recalculates all of this at order time — this is
   * only so the customer sees the right number before committing.
   */
  const deliveryFee = (() => {
    if (!method) return 0;
    if (zones.length === 0) return method.baseCost;
    if (!zone) return 0;
    if (zone.freeAbove != null && subtotal >= zone.freeAbove) return 0;
    return zone.price;
  })();
  const total = subtotal + deliveryFee;
  const needsAddress = method?.type === "DELIVERY";

  const canSubmit = useMemo(
    () =>
      items.length > 0 &&
      form.name.trim().length > 1 &&
      validPhone(form.phone) &&
      !!methodId &&
      (zones.length === 0 || !!zoneId) &&
      (!needsAddress || form.details.trim().length > 3),
    [items.length, form, methodId, zoneId, zones.length, needsAddress]
  );

  async function submit() {
    setError(null);
    try {
      const { order, requiresPayment, alreadyPaid } = await api.placeOrder({
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        email: form.email.trim() || undefined,
        lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryMethodId: methodId,
        deliveryZoneId: zoneId || undefined,
        deliveryDetails:
          form.details.trim() || form.instructions.trim()
            ? {
                note: form.details.trim() || undefined,
                instructions: form.instructions.trim() || undefined,
              }
            : undefined,
        idempotencyKey: idempotencyKey.current,
      });

      // If this submit matched an already-PAID order (e.g. the customer came
      // back to checkout with the same cart after paying), don't try to charge
      // again — send them to their account where the order and its status live.
      if (alreadyPaid) {
        clear();
        router.push("/account");
        return;
      }

      // Pay-on-delivery path (POD method, customer didn't choose pay-now):
      // order is already CONFIRMED — straight to the receipt.
      if (!requiresPayment && !willPayNow) {
        clear();
        router.push(`/order/${order.orderNumber}`);
        return;
      }

      // Pay-now path: fire the STK push and wait for the callback.
      setPhase("paying");
      currentOrderNumber.current = order.orderNumber;
      const stk = await api.initiateStk(order.id, normalizePhone(form.phone));
      pollStatus(stk.checkoutRequestId, order.orderNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("form");
    }
  }

  /**
   * Poll the backend until the payment resolves. The backend itself queries
   * Daraja directly when a callback is slow or misconfigured, so this resolves
   * even if the webhook never fires. STK prompts live for ~60s, so we poll for
   * a bit beyond that before offering a manual re-check.
   */
  function pollStatus(id: string, orderNumber: string) {
    let tries = 0;
    const MAX_TRIES = 28; // ~84s at 3s

    const done = () => {
      clearInterval(timer);
      clear();
      router.push("/account");
    };

    const timer = setInterval(async () => {
      tries++;
      try {
        const res = await api.paymentStatus(id);
        if (res.isPaid || res.status === "PAID") return done();
        if (res.status === "FAILED") return done();
        if (res.stalePending) return done();
      } catch {
        /* transient — keep polling */
      }
      // Waited out the STK window with no resolution: the order is safe and
      // sitting on the account page as "awaiting payment", so send them there.
      if (tries >= MAX_TRIES) return done();
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

  // --- STK waiting screen (shown only while polling; all outcomes redirect
  //     to the account page, so there's no dead-end state here) ---
  if (phase === "paying") {
    return (
      <div className="shell py-24">
        <div className="card animate-rise mx-auto max-w-lg p-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-indigo/40">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
          </div>
          <h1 className="display mt-6 text-2xl">Check your phone</h1>
          <p className="mt-3 text-muted">
            We've sent an M-Pesa prompt to{" "}
            <span className="text-cloud">{normalizePhone(form.phone)}</span>. Enter your PIN
            to pay {formatKes(total)}.
          </p>
          <p className="mt-4 text-sm text-faint">
            Waiting for confirmation — this can take a few seconds. You'll be taken to your
            orders once it's done.
          </p>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">Your details</p>
              {accountReady && !customer && (
                <Link
                  href="/account/login?next=/checkout"
                  className="text-xs text-muted underline hover:text-cloud"
                >
                  Sign in to autofill
                </Link>
              )}
            </div>

            {existingAccount && (
              <div className="mb-4 rounded-xl border border-indigo/30 bg-indigo/10 px-4 py-3 text-sm">
                <span className="text-cloud">
                  {existingAccount.name ? `Welcome back, ${existingAccount.name}.` : "This number has an account."}
                </span>{" "}
                <Link href="/account/login?next=/checkout" className="text-white underline">
                  Sign in
                </Link>{" "}
                <span className="text-muted">— or keep going as a guest.</span>
              </div>
            )}

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
                type="email"
                placeholder="Email — for your receipt"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <p className="mt-2 text-xs text-faint">
              We use your phone for M-Pesa and delivery, and your email for the receipt.
            </p>
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
                        // A zone belongs to one method; carrying it across
                        // would price the order against the wrong area.
                        setZoneId("");
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
                      {(m.zones ?? []).filter((z) => z.active !== false).length > 0
                        ? "By area"
                        : m.baseCost === 0
                        ? "Free"
                        : formatKes(m.baseCost)}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Areas, only for methods that have them. Required — otherwise
                someone upcountry could check out at the CBD rate. */}
            {zones.length > 0 && (
              <div className="animate-rise mt-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="label mb-0">Which area?</p>
                  {/* A search box earns its place once there are enough areas
                      that scanning the list becomes a chore. */}
                  {zones.length > 6 && (
                    <input
                      className="field h-9 max-w-[200px] py-1.5 text-sm"
                      placeholder="Search areas…"
                      value={zoneSearch}
                      onChange={(e) => setZoneSearch(e.target.value)}
                      aria-label="Search delivery areas"
                    />
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleZones.map((z) => {
                    const free = z.freeAbove != null && subtotal >= z.freeAbove;
                    return (
                      <label
                        key={z.id}
                        className={`card flex cursor-pointer items-center gap-3 p-3 transition-colors ${
                          zoneId === z.id ? "border-white/40" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="zone"
                          checked={zoneId === z.id}
                          onChange={() => setZoneId(z.id)}
                          className="accent-white"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-cloud">{z.name}</span>
                          {z.description && (
                            <span className="block text-xs text-faint">{z.description}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm">
                          {free ? (
                            <span className="text-whatsapp">Free</span>
                          ) : z.price === 0 ? (
                            "Free"
                          ) : (
                            formatKes(z.price)
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {visibleZones.length === 0 && (
                  <p className="col-span-full py-2 text-sm text-faint">
                    No areas match "{zoneSearch}". Try a different spelling, or reach us on
                    WhatsApp if yours isn't listed.
                  </p>
                )}
                {!zoneId && visibleZones.length > 0 && (
                  <p className="mt-2 text-xs text-faint">
                    Pick your area so we can work out the delivery cost.
                  </p>
                )}
              </div>
            )}

            {needsAddress && (
              <div className="mt-4">
                <label className="label">Delivery address</label>
                <textarea
                  className="field min-h-24"
                  placeholder="Estate, street, house or apartment number"
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                />
              </div>
            )}

            {/* Optional extras, for anything that gets physically delivered or
                dropped at an agent — a building name, a gate code, someone
                else's number if the buyer won't be reachable. Never required. */}
            {method && method.type !== "STORE_PICKUP" && (
              <div className="mt-4">
                <label className="label">
                  Delivery instructions{" "}
                  <span className="font-normal text-faint">(optional)</span>
                </label>
                <textarea
                  className="field min-h-20"
                  placeholder="Exact building, landmark, gate code, or an alternative phone number"
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                />
              </div>
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

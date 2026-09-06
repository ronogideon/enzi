"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/account";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { Icon } from "@/components/Icons";
import type { Order } from "@/lib/types";

type MyOrder = Order & {
  canPay?: boolean;
  lastPaymentStatus?: string | null;
  lastPaymentMessage?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Being packed",
  PACKED: "Packed",
  DISPATCHED: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

function statusTone(status: string, isPaid: boolean): string {
  if (status === "DELIVERED") return "text-whatsapp";
  if (status === "CANCELLED" || status === "REFUNDED") return "text-red-300";
  if (status === "PENDING_PAYMENT" && !isPaid) return "text-gold";
  return "text-cloud";
}

const RETRY_COOLDOWN_S = 40;

export default function AccountPage() {
  const router = useRouter();
  const { customer, ready, logout, refresh } = useAccount();

  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [tab, setTab] = useState<"orders" | "details">("orders");

  useEffect(() => {
    if (ready && !customer) router.replace("/account/login");
  }, [ready, customer, router]);

  const load = useCallback(() => {
    if (!customer) return;
    api.myOrders().then(setOrders).catch(() => setOrders([]));
  }, [customer]);

  useEffect(() => { load(); }, [load]);

  /**
   * Poll while any order is still awaiting payment, so a confirmation that
   * lands after the customer arrives here (the STK was slow, or they came
   * straight from checkout) flips the status to paid without a manual refresh.
   * Stops once nothing is pending.
   */
  const hasPending = (orders ?? []).some(
    (o) => !o.isPaid && o.status === "PENDING_PAYMENT"
  );
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 5000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  if (!ready || !customer) {
    return (
      <div className="shell grid place-items-center py-24">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="shell py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl">Hi {customer.name ?? "there"}</h1>
          <p className="mt-1 text-sm text-muted">
            {customer.orderCount} order{customer.orderCount === 1 ? "" : "s"} ·{" "}
            {formatKes(customer.totalSpent)} spent
          </p>
        </div>
        <button
          onClick={() => { logout(); router.push("/"); }}
          className="text-sm text-muted hover:text-cloud"
        >
          Sign out
        </button>
      </div>

      <div className="mt-8 flex gap-2">
        {(["orders", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === t ? "border-white/40 text-white" : "border-ink-line text-muted"
            }`}
          >
            {t === "orders" ? "My orders" : "My details"}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <div className="mt-6">
          {orders === null ? (
            <p className="text-sm text-muted">Loading your orders…</p>
          ) : orders.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-display text-xl text-white">No orders yet</p>
              <Link href="/shop" className="btn-primary mt-6 inline-flex px-8">
                Start shopping
              </Link>
            </div>
          ) : (
            <div className="stagger space-y-3">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} onChanged={load} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <DetailsPanel onSaved={refresh} />
      )}
    </div>
  );
}

function OrderRow({ order, onChanged }: { order: MyOrder; onChanged: () => void }) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [prompted, setPrompted] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const needsPayment = !order.isPaid && order.status === "PENDING_PAYMENT";

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RETRY_COOLDOWN_S);
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && cooldownTimer.current) {
          clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function retry() {
    setPaying(true);
    setError(null);
    try {
      const { checkoutRequestId } = await api.retryOrderPayment(order.orderNumber);
      setPrompted(true);
      startCooldown();

      // Poll the STATUS endpoint — not just the order list. This is what the
      // account page was missing: the status endpoint asks the gateway
      // directly, so the payment confirms even when the webhook doesn't arrive.
      // Same mechanism the checkout screen uses.
      let elapsed = 0;
      const timer = setInterval(async () => {
        elapsed += 2;
        try {
          const res = await api.paymentStatus(checkoutRequestId);
          if (res.isPaid || res.status === "PAID" || res.status === "FAILED") {
            clearInterval(timer);
            onChanged();
            return;
          }
        } catch {
          /* transient */
        }
        // Stop after the STK window; the order stays on the page either way.
        if (elapsed >= 30) {
          clearInterval(timer);
          onChanged();
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the payment");
    } finally {
      setPaying(false);
    }
  }

  // The fulfilment journey, mapped to four visible milestones. A cancelled or
  // refunded order shows its own state instead of the track.
  const STEPS = [
    { key: "ordered", label: "Ordered", reached: true, at: order.createdAt },
    {
      key: "confirmed",
      label: order.isPaid ? "Paid" : "Confirmed",
      reached: order.isPaid || ["CONFIRMED", "PROCESSING", "PACKED", "DISPATCHED", "DELIVERED"].includes(order.status),
      at: order.paidAt,
    },
    {
      key: "packed",
      label: "Packed",
      reached: ["PACKED", "DISPATCHED", "DELIVERED"].includes(order.status),
      at: order.packedAt,
    },
    {
      key: "shipped",
      label: order.deliveryMethod?.type === "STORE_PICKUP" ? "Ready" : "Shipped",
      reached: ["DISPATCHED", "DELIVERED"].includes(order.status),
      at: order.dispatchedAt,
    },
    {
      key: "delivered",
      label: "Delivered",
      reached: order.status === "DELIVERED",
      at: order.deliveredAt,
    },
  ];
  const cancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  const lastReached = STEPS.map((s) => s.reached).lastIndexOf(true);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: order identity + the journey */}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-faint">Order #{order.orderNumber}</p>
          <p className="mt-0.5 font-medium text-white">
            {order.items?.length
              ? order.items.map((i) => `${i.name}`).slice(0, 2).join(", ")
              : "Order"}
            {(order.items?.length ?? 0) > 2 && ` +${order.items!.length - 2} more`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {new Date(order.createdAt).toLocaleDateString("en-KE")} · {formatKes(order.total)}
          </p>

          {cancelled ? (
            <p className="mt-5 inline-block rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm text-red-300">
              {STATUS_LABEL[order.status]}
            </p>
          ) : (
            <div className="mt-6 max-w-md">
              {/* The progress track */}
              <div className="relative flex items-center justify-between">
                {/* base line */}
                <div className="absolute left-0 right-0 top-[9px] h-0.5 bg-ink-line" />
                {/* filled line up to the last reached step */}
                <div
                  className="absolute left-0 top-[9px] h-0.5 bg-whatsapp transition-all duration-500"
                  style={{
                    width:
                      lastReached <= 0
                        ? "0%"
                        : `${(lastReached / (STEPS.length - 1)) * 100}%`,
                  }}
                />
                {STEPS.map((step) => (
                  <div key={step.key} className="relative z-10 flex flex-col items-center">
                    <span
                      className={`grid h-[18px] w-[18px] place-items-center rounded-full border-2 transition-colors ${
                        step.reached
                          ? "border-whatsapp bg-whatsapp text-ink"
                          : "border-ink-line bg-ink text-transparent"
                      }`}
                    >
                      <Icon.Check className="h-3 w-3" />
                    </span>
                  </div>
                ))}
              </div>
              {/* labels + dates under each node */}
              <div className="mt-2 flex items-start justify-between">
                {STEPS.map((step) => (
                  <div key={step.key} className="w-1/5 text-center first:text-left last:text-right">
                    <p className={`text-[11px] ${step.reached ? "text-cloud" : "text-faint"}`}>
                      {step.label}
                    </p>
                    {step.at && (
                      <p className="text-[10px] text-faint">
                        {new Date(step.at).toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: actions — retry (if unpaid) and download receipt */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-48">
          {needsPayment && (
            <button
              onClick={retry}
              disabled={paying || cooldown > 0}
              className="btn-primary text-sm"
            >
              {paying
                ? "Sending…"
                : cooldown > 0
                ? `Retry Payment in ${cooldown}s`
                : "Retry Payment"}
            </button>
          )}
          {order.isPaid && (
            <a
              href={api.receiptUrl(order.orderNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center justify-center gap-2 text-sm"
            >
              <Icon.Download className="h-4 w-4" />
              Download receipt
            </a>
          )}
          <Link
            href={`/order/${order.orderNumber}`}
            className="text-center text-xs text-muted underline-offset-4 hover:text-cloud hover:underline"
          >
            See order details
          </Link>
        </div>
      </div>

      {/* Payment status note for unpaid orders */}
      {needsPayment && (
        <div className="border-t border-ink-line bg-gold/[0.04] px-5 py-3">
          <p className="text-sm text-gold">
            {prompted && cooldown > 0
              ? "Prompt sent — enter your M-Pesa PIN on your phone. You can retry once the timer ends."
              : order.lastPaymentStatus === "FAILED"
              ? order.lastPaymentMessage ?? "The last payment didn't go through."
              : "This order is waiting for payment."}
          </p>
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

function DetailsPanel({ onSaved }: { onSaved: () => Promise<void> }) {
  const { customer } = useAccount();
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    marketingConsent: customer?.marketingConsent ?? true,
  });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveProfile() {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        marketingConsent: form.marketingConsent,
      });
      await onSaved();
      setMessage({ ok: true, text: "Saved." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    setMessage(null);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "" });
      setMessage({ ok: true, text: "Password changed." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't change password" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {message && (
        <div
          className={`lg:col-span-2 rounded-lg border px-3 py-2 text-sm ${
            message.ok
              ? "border-whatsapp/30 bg-whatsapp/10 text-whatsapp"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card space-y-4 p-6">
        <p className="font-display text-lg font-bold text-white">Your details</p>
        <div>
          <label className="label">Name</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="field"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="field opacity-60" value={`+${customer?.phone ?? ""}`} disabled />
          <p className="mt-1 text-xs text-faint">
            Your phone is your account ID — contact us to change it.
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })}
            className="mt-1 accent-white"
          />
          <span>Send me offers and restock alerts by SMS.</span>
        </label>
        <button className="btn-primary" onClick={saveProfile} disabled={busy}>
          Save details
        </button>
      </div>

      <div className="card space-y-4 p-6">
        <p className="font-display text-lg font-bold text-white">Change password</p>
        <div>
          <label className="label">Current password</label>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
          />
          <p className="mt-1 text-xs text-faint">At least 8 characters.</p>
        </div>
        <button
          className="btn-primary"
          onClick={savePassword}
          disabled={busy || !pw.current || pw.next.length < 8}
        >
          Change password
        </button>
      </div>
    </div>
  );
}

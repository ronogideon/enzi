"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/lib/account";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { Order } from "@/lib/types";

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

export default function AccountPage() {
  const router = useRouter();
  const { customer, ready, logout, refresh } = useAccount();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tab, setTab] = useState<"orders" | "details">("orders");

  useEffect(() => {
    if (ready && !customer) router.replace("/account/login");
  }, [ready, customer, router]);

  useEffect(() => {
    if (!customer) return;
    api.myOrders().then(setOrders).catch(() => setOrders([]));
  }, [customer]);

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
            <div className="space-y-3">
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/order/${o.orderNumber}`}
                  className="card card-hover flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div>
                    <p className="font-medium text-white">{o.orderNumber}</p>
                    <p className="text-xs text-muted">
                      {new Date(o.createdAt).toLocaleDateString()} ·{" "}
                      {o.items?.length ?? 0} item{o.items?.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-white">{formatKes(o.total)}</p>
                    <p className="text-xs text-muted">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </p>
                  </div>
                </Link>
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

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatKes } from "@/lib/money";
import type { Order, OrderStatus } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, useAsync,
} from "@/components/ui";

/**
 * Filters are written the way the shop floor thinks about the day rather than
 * as raw status names: "to pack" is the live queue, "to ship" is everything
 * boxed and waiting for a rider or a matatu.
 */
const FILTERS: { key: string; label: string; countKey?: string }[] = [
  { key: "QUEUE", label: "To pack", countKey: "QUEUE" },
  { key: "PACKED", label: "To ship", countKey: "PACKED" },
  { key: "DISPATCHED", label: "On the way", countKey: "DISPATCHED" },
  { key: "PENDING_PAYMENT", label: "Awaiting payment", countKey: "PENDING_PAYMENT" },
  { key: "DELIVERED", label: "Delivered", countKey: "DELIVERED" },
  { key: "", label: "All", countKey: "ALL" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "awaiting payment",
  CONFIRMED: "ready to pack",
  PROCESSING: "being packed",
  PACKED: "packed",
  DISPATCHED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  DRAFT: "draft",
};

/** What the button should say, in shop language. */
const ACTION_LABEL: Record<string, string> = {
  CONFIRMED: "Confirm order",
  PROCESSING: "Start packing",
  PACKED: "Mark as packed",
  DISPATCHED: "Mark as shipped",
  DELIVERED: "Mark as delivered",
  CANCELLED: "Cancel order",
  REFUNDED: "Mark refunded",
};

function statusTone(s: string): "green" | "gold" | "danger" | "muted" | "indigo" {
  if (s === "DELIVERED") return "green";
  if (s === "CONFIRMED") return "green";
  if (s === "CANCELLED" || s === "REFUNDED") return "danger";
  if (s === "PENDING_PAYMENT" || s === "PACKED") return "gold";
  if (s === "DISPATCHED") return "indigo";
  return "muted";
}

export default function Orders() {
  const [filter, setFilter] = useState("QUEUE");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const orders = useAsync(
    () => api.orders({ status: filter || undefined, search: query || undefined }),
    [filter, query]
  );
  const counts = useAsync(() => api.orderCounts(), []);

  // Live-ish list: refresh every 20s so a payment confirmation or a colleague
  // packing an order appears without anyone hitting reload. Skipped while the
  // tab is in the background.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      orders.reload();
      counts.reload();
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function refreshAll() {
    orders.reload();
    counts.reload();
  }

  return (
    <>
      <PageHeader title="Orders" subtitle="Pack, ship and track every customer order" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
          className="flex gap-2"
        >
          <input
            className="field max-w-xs"
            placeholder="Order no., name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-ghost shrink-0" type="submit">Search</button>
          {query && (
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={() => { setSearch(""); setQuery(""); }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f.countKey ? counts.data?.[f.countKey] : undefined;
          return (
            <button
              key={f.key || "all"}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                filter === f.key
                  ? "border-white/40 text-white"
                  : "border-ink-line text-muted hover:text-cloud"
              }`}
            >
              {f.label}
              {n !== undefined && n > 0 && (
                <span className="ml-1.5 text-faint">{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {orders.loading ? (
        <Spinner />
      ) : orders.error ? (
        <EmptyState title="Couldn't load orders" hint={orders.error} />
      ) : (orders.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing here"
          hint={
            filter === "QUEUE"
              ? "No orders waiting to be packed. Good place to be."
              : "Orders will appear as customers check out."
          }
        />
      ) : (
        <>
        {/* Mobile: order cards. This is the screen staff use standing at the
            bench, so the tap target is the whole card. */}
        <div className="space-y-3 md:hidden">
          {(orders.data ?? []).map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className="rec w-full text-left transition-colors active:bg-ink-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{o.orderNumber}</p>
                  <p className="truncate text-xs text-faint">
                    {o.customer?.name ?? "—"} · {o.customer?.phone}
                  </p>
                </div>
                <span className="shrink-0 font-medium text-cloud">{formatKes(o.total)}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(o.status)}>
                  {STATUS_LABEL[o.status] ?? o.status.toLowerCase()}
                </Badge>
                {o.isPaid ? (
                  <Badge tone="green">paid</Badge>
                ) : o.isPayOnDelivery ? (
                  <Badge tone="gold">on delivery</Badge>
                ) : (
                  <Badge tone="muted">unpaid</Badge>
                )}
                <span className="text-xs text-faint">
                  {o.items.length} item{o.items.length === 1 ? "" : "s"}
                </span>
              </div>

              <p className="mt-2 text-xs text-faint">
                {o.deliveryMethod?.name ?? "—"} · {new Date(o.createdAt).toLocaleDateString()}
                {o.packedBy && ` · packed by ${o.packedBy.name}`}
              </p>
            </button>
          ))}
        </div>

        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Order</th>
                <th className="th">Customer</th>
                <th className="th">Delivery</th>
                <th className="th text-right">Total</th>
                <th className="th text-center">Paid</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).map((o) => (
                <tr key={o.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td">
                    <p className="font-medium text-white">{o.orderNumber}</p>
                    <p className="text-xs text-faint">
                      {new Date(o.createdAt).toLocaleDateString()} ·{" "}
                      {o.items.length} item{o.items.length === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="td">
                    <p className="text-cloud">{o.customer?.name ?? "—"}</p>
                    <p className="text-xs text-faint">{o.customer?.phone}</p>
                  </td>
                  <td className="td text-muted">
                    {o.deliveryMethod?.name ?? "—"}
                    {o.trackingRef && (
                      <div className="text-xs text-faint">ref {o.trackingRef}</div>
                    )}
                  </td>
                  <td className="td text-right">{formatKes(o.total)}</td>
                  <td className="td text-center">
                    {o.isPaid ? (
                      <Badge tone="green">paid</Badge>
                    ) : o.isPayOnDelivery ? (
                      <Badge tone="gold">on delivery</Badge>
                    ) : (
                      <Badge tone="muted">unpaid</Badge>
                    )}
                  </td>
                  <td className="td">
                    <Badge tone={statusTone(o.status)}>
                      {STATUS_LABEL[o.status] ?? o.status.toLowerCase()}
                    </Badge>
                    {o.packedBy && (
                      <div className="mt-1 text-xs text-faint">by {o.packedBy.name}</div>
                    )}
                  </td>
                  <td className="td text-right">
                    <button
                      className="text-sm text-indigo hover:underline"
                      onClick={() => setSelectedId(o.id)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {selectedId && (
        <OrderModal
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refreshAll}
        />
      )}
    </>
  );
}

function OrderModal({
  orderId, onClose, onChanged,
}: {
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const detail = useAsync(() => api.order(orderId), [orderId]);
  const [busy, setBusy] = useState(false);

  // While an order is waiting on payment, poll so the "paid" state appears the
  // moment the callback lands — no manual refresh, which is what made a
  // successful payment look like nothing happened.
  useEffect(() => {
    const o = detail.data;
    if (!o || o.isPaid || o.status === "CANCELLED" || o.status === "DELIVERED") return;
    const timer = setInterval(() => {
      if (!document.hidden) detail.reload();
    }, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.isPaid, detail.data?.status]);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const order = detail.data;
  // Seed the editable fields once the order arrives, without clobbering typing.
  if (order && tracking === null) setTracking(order.trackingRef ?? "");
  if (order && notes === null) setNotes(order.staffNotes ?? "");

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await detail.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  function advance(to: OrderStatus) {
    if (to === "CANCELLED" && !confirm("Cancel this order? Stock will be returned to the shelf."))
      return;
    return act(() => api.advanceOrder(orderId, to));
  }

  if (detail.loading || !order) {
    return (
      <Modal title="Order" onClose={onClose} wide>
        {detail.error ? <EmptyState title="Couldn't load" hint={detail.error} /> : <Spinner />}
      </Modal>
    );
  }

  const nexts = order.nextStatuses ?? [];
  const details = order.deliveryDetails as
    | { note?: string; instructions?: string }
    | null;
  const address = details?.note ?? null;
  const instructions = details?.instructions ?? null;

  return (
    <Modal title={`Order ${order.orderNumber}`} onClose={onClose} wide>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Badge tone={statusTone(order.status)}>
          {STATUS_LABEL[order.status] ?? order.status.toLowerCase()}
        </Badge>
        {order.isPaid ? (
          <Badge tone="green">paid</Badge>
        ) : order.isPayOnDelivery ? (
          <Badge tone="gold">pay on delivery</Badge>
        ) : (
          <Badge tone="muted">unpaid</Badge>
        )}
        <span className="text-xs text-faint">
          Placed {new Date(order.createdAt).toLocaleString()}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {/* Packing list */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id} className="border-b border-ink-line/60 last:border-0">
                    <td className="td">
                      <span className="font-medium text-white">{it.quantity} ×</span>{" "}
                      <span className="text-cloud">{it.name}</span>
                      <div className="text-xs text-faint">{formatKes(it.unitPrice)} each</div>
                    </td>
                    <td className="td text-right">{formatKes(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{formatKes(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Delivery</span>
              <span>{formatKes(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between border-t border-ink-line pt-2 font-semibold text-white">
              <span>Total</span>
              <span>{formatKes(order.total)}</span>
            </div>
          </div>

          {/* Fulfilment actions */}
          <div className="mt-6">
            <p className="label">What's next</p>
            {nexts.length === 0 ? (
              <p className="text-sm text-muted">
                This order is finished — nothing left to do.
              </p>
            ) : (
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                {nexts.map((n) => (
                  <button
                    key={n}
                    disabled={busy}
                    onClick={() => advance(n)}
                    className={n === "CANCELLED" || n === "REFUNDED" ? "btn-danger" : "btn-primary"}
                  >
                    {ACTION_LABEL[n] ?? n}
                  </button>
                ))}
              </div>
            )}

            {!order.isPaid && order.status !== "CANCELLED" && can(["SUPERADMIN", "ADMIN"]) && (
              <button
                disabled={busy}
                onClick={() => act(() => api.markOrderPaid(orderId))}
                className="btn-ghost mt-3"
              >
                Record payment received
              </button>
            )}
          </div>

          {/* Tracking + notes */}
          <div className="mt-6 grid gap-4">
            <div>
              <label className="label">Tracking / parcel reference</label>
              <div className="flex gap-2">
                <input
                  className="field"
                  value={tracking ?? ""}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="Matatu waybill, Mtaani agent code…"
                />
                <button
                  className="btn-ghost shrink-0"
                  disabled={busy}
                  onClick={() => act(() => api.updateOrder(orderId, { trackingRef: tracking }))}
                >
                  Save
                </button>
              </div>
            </div>
            <div>
              <label className="label">Internal notes</label>
              <textarea
                className="field min-h-20"
                value={notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the next person handling this should know."
              />
              <button
                className="btn-ghost mt-2"
                disabled={busy}
                onClick={() => act(() => api.updateOrder(orderId, { staffNotes: notes }))}
              >
                Save notes
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: who, where, history */}
        <aside className="space-y-5 text-sm">
          <div className="card p-4">
            <p className="label">Customer</p>
            <p className="text-cloud">{order.customer?.name ?? "—"}</p>
            {order.customer?.phone && (
              <a href={`tel:+${order.customer.phone}`} className="block text-muted hover:text-cloud">
                +{order.customer.phone}
              </a>
            )}
            {order.customer?.email && (
              <a
                href={`mailto:${order.customer.email}`}
                className="block break-all text-muted hover:text-cloud"
              >
                {order.customer.email}
              </a>
            )}
          </div>

          <div className="card p-4">
            <p className="label">Delivery</p>
            <p className="text-cloud">{order.deliveryMethod?.name ?? "—"}</p>
            {order.deliveryZone?.name && (
              <p className="text-sm text-muted">{order.deliveryZone.name}</p>
            )}
            {address && <p className="mt-1 whitespace-pre-wrap text-muted">{address}</p>}
            {instructions && (
              <div className="mt-2 rounded-lg border border-gold/25 bg-gold/5 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                  Instructions
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-cloud">{instructions}</p>
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="label">History</p>
            <ul className="space-y-2">
              {(order.events ?? []).map((ev) => (
                <li key={ev.id} className="text-xs">
                  <span className="text-cloud">
                    {ev.toStatus ? STATUS_LABEL[ev.toStatus] ?? ev.toStatus : ev.note}
                  </span>
                  <div className="text-faint">
                    {new Date(ev.createdAt).toLocaleString()}
                    {ev.staff && ` · ${ev.staff.name}`}
                  </div>
                  {ev.toStatus && ev.note && (
                    <div className="text-faint">{ev.note}</div>
                  )}
                </li>
              ))}
              {(order.events ?? []).length === 0 && (
                <li className="text-xs text-faint">Nothing recorded yet.</li>
              )}
            </ul>
          </div>

          <button className="btn-ghost w-full" onClick={() => window.print()}>
            Print packing slip
          </button>
        </aside>
      </div>
    </Modal>
  );
}

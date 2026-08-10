import { useState } from "react";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { Order } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, useAsync,
} from "@/components/ui";

const STATUSES = [
  "", "PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED",
  "DISPATCHED", "DELIVERED", "CANCELLED",
];

// mirrors the backend transition graph
const NEXT: Record<string, string[]> = {
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  PENDING_PAYMENT: ["CANCELLED"],
};

function statusTone(s: string): "green" | "gold" | "danger" | "muted" | "indigo" {
  if (s === "DELIVERED" || s === "CONFIRMED") return "green";
  if (s === "CANCELLED") return "danger";
  if (s === "PENDING_PAYMENT") return "gold";
  if (s === "DISPATCHED") return "indigo";
  return "muted";
}

export default function Orders() {
  const [filter, setFilter] = useState("");
  const orders = useAsync(() => api.orders(filter || undefined), [filter]);
  const [selected, setSelected] = useState<Order | null>(null);

  return (
    <>
      <PageHeader title="Orders" subtitle="Track and fulfil customer orders" />

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              filter === s ? "border-white/40 text-white" : "border-ink-line text-muted hover:text-cloud"
            }`}
          >
            {s ? s.replace("_", " ").toLowerCase() : "all"}
          </button>
        ))}
      </div>

      {orders.loading ? (
        <Spinner />
      ) : orders.error ? (
        <EmptyState title="Couldn’t load orders" hint={orders.error} />
      ) : orders.data!.length === 0 ? (
        <EmptyState title="No orders here" hint="Orders will appear as customers check out." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
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
              {orders.data!.map((o) => (
                <tr key={o.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td font-medium text-white">{o.orderNumber}</td>
                  <td className="td text-muted">
                    {o.customer?.name ?? o.customer?.phone ?? "—"}
                  </td>
                  <td className="td text-muted">{o.deliveryMethod?.name ?? "—"}</td>
                  <td className="td text-right">{formatKes(o.total)}</td>
                  <td className="td text-center">
                    {o.isPaid ? <Badge tone="green">paid</Badge> :
                      o.isPayOnDelivery ? <Badge tone="gold">POD</Badge> : <Badge tone="muted">unpaid</Badge>}
                  </td>
                  <td className="td">
                    <Badge tone={statusTone(o.status)}>{o.status.replace("_", " ").toLowerCase()}</Badge>
                  </td>
                  <td className="td text-right">
                    <button className="text-sm text-indigo hover:underline" onClick={() => setSelected(o)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <OrderModal
          order={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); orders.reload(); }}
        />
      )}
    </>
  );
}

function OrderModal({
  order, onClose, onChanged,
}: {
  order: Order;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nexts = NEXT[order.status] ?? [];

  async function advance(to: string) {
    setBusy(true); setError(null);
    try {
      await api.advanceOrder(order.id, to);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Order ${order.orderNumber}`} onClose={onClose} wide>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <span className="text-faint">Customer</span>
          <p className="text-cloud">{order.customer?.name ?? "—"} · {order.customer?.phone}</p>
        </div>
        <div>
          <span className="text-faint">Delivery</span>
          <p className="text-cloud">{order.deliveryMethod?.name ?? "—"}</p>
        </div>
        <div>
          <span className="text-faint">Payment</span>
          <p className="text-cloud">
            {order.isPaid ? "Paid" : order.isPayOnDelivery ? "Pay on delivery" : "Unpaid"}
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-b border-ink-line/60 last:border-0">
                <td className="td">{it.name} <span className="text-faint">× {it.quantity}</span></td>
                <td className="td text-right">{formatKes(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{formatKes(order.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Delivery</span><span>{formatKes(order.deliveryFee)}</span></div>
        <div className="flex justify-between font-semibold text-white"><span>Total</span><span>{formatKes(order.total)}</span></div>
      </div>

      {nexts.length > 0 && (
        <div className="mt-6">
          <p className="label">Advance status</p>
          <div className="flex flex-wrap gap-2">
            {nexts.map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => advance(n)}
                className={n === "CANCELLED" ? "btn-danger" : "btn-primary"}
              >
                {n === "CANCELLED" ? "Cancel order" : `Mark ${n.toLowerCase()}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

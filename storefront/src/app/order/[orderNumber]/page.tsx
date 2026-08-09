import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export default async function OrderPage({
  params,
}: {
  params: { orderNumber: string };
}) {
  const order = await api.orderByNumber(params.orderNumber);
  if (!order) notFound();

  const paid = order.isPaid;
  const pod = order.isPayOnDelivery && !paid;

  return (
    <div className="shell py-16">
      <div className="mx-auto max-w-2xl">
        <div className="card p-8">
          {/* header */}
          <div className="flex items-center gap-4 border-b border-ink-line pb-6">
            <div
              className={`grid h-12 w-12 place-items-center rounded-full ${
                paid || order.status === "CONFIRMED"
                  ? "bg-whatsapp/15 text-whatsapp"
                  : "bg-gold/15 text-gold"
              }`}
            >
              {paid || order.status === "CONFIRMED" ? "✓" : "•"}
            </div>
            <div>
              <h1 className="display text-2xl">
                {paid ? "Payment received" : pod ? "Order reserved" : "Order placed"}
              </h1>
              <p className="text-sm text-muted">
                {order.orderNumber} ·{" "}
                {STATUS_LABEL[order.status] ?? order.status}
              </p>
            </div>
          </div>

          {/* items */}
          <div className="space-y-3 py-6">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 text-sm">
                <span className="text-cloud">
                  {item.name} <span className="text-faint">× {item.quantity}</span>
                </span>
                <span className="text-cloud">{formatKes(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          {/* totals */}
          <div className="space-y-2 border-t border-ink-line py-6 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span className="text-cloud">{formatKes(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">
                Delivery{order.deliveryMethod ? ` · ${order.deliveryMethod.name}` : ""}
              </span>
              <span className="text-cloud">
                {order.deliveryFee === 0 ? "Free" : formatKes(order.deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between pt-2 text-base">
              <span className="font-medium text-white">Total</span>
              <span className="font-display font-bold text-white">
                {formatKes(order.total)}
              </span>
            </div>
          </div>

          {/* payment state */}
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              paid
                ? "border-whatsapp/30 bg-whatsapp/10 text-whatsapp"
                : "border-gold/30 bg-gold/10 text-gold"
            }`}
          >
            {paid
              ? "Paid via M-Pesa. We’re preparing your order."
              : pod
                ? "Pay on delivery — have the amount ready when your order arrives."
                : "Awaiting M-Pesa confirmation."}
          </div>

          <div className="mt-8 flex gap-3">
            <Link href="/shop" className="btn-primary flex-1">
              Continue shopping
            </Link>
            <Link href="/contact" className="btn-ghost">
              Need help?
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Keep your order number <span className="text-muted">{order.orderNumber}</span> to
          track this order.
        </p>
      </div>
    </div>
  );
}

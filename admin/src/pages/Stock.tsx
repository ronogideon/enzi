import { useState } from "react";
import { api } from "@/lib/api";
import type { Product, StockAudit } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Badge, Modal, useAsync,
} from "@/components/ui";

export default function Stock() {
  const products = useAsync(() => api.products("?tier=RETAIL"), []);
  const [audit, setAudit] = useState<StockAudit | null>(null);
  const [restocking, setRestocking] = useState<Product | null>(null);
  const [openingAudit, setOpeningAudit] = useState(false);

  async function openAudit() {
    setOpeningAudit(true);
    try {
      setAudit(await api.openAudit());
    } finally {
      setOpeningAudit(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Stock & Audits"
        subtitle="Restock items and reconcile physical counts"
        action={
          <button className="btn-primary" onClick={openAudit} disabled={openingAudit}>
            {openingAudit ? "Opening…" : "Open stock audit"}
          </button>
        }
      />

      {products.loading ? (
        <Spinner />
      ) : products.error ? (
        <EmptyState title="Couldn’t load stock" hint={products.error} />
      ) : (
        <div className="card -mx-4 overflow-x-auto rounded-none sm:mx-0 sm:rounded-2xl">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Product</th>
                <th className="th">Category</th>
                <th className="th text-right">In stock</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {products.data!.map((p) => (
                <tr key={p.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td font-medium text-white">{p.name}</td>
                  <td className="td text-muted">{p.category?.name ?? "—"}</td>
                  <td className="td text-right">
                    <Badge tone={p.stockQty <= 10 ? "gold" : "muted"}>{p.stockQty}</Badge>
                  </td>
                  <td className="td text-right">
                    <button className="text-sm text-indigo hover:underline" onClick={() => setRestocking(p)}>
                      Restock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restocking && (
        <RestockModal
          product={restocking}
          onClose={() => setRestocking(null)}
          onDone={() => { setRestocking(null); products.reload(); }}
        />
      )}

      {audit && (
        <AuditModal
          audit={audit}
          onClose={() => setAudit(null)}
          onClosed={() => { setAudit(null); products.reload(); }}
        />
      )}
    </>
  );
}

function RestockModal({
  product, onClose, onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (qty <= 0) return;
    setBusy(true);
    try {
      await api.restock(product.id, Number(qty), note || undefined);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Restock · ${product.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        Current stock: <span className="text-cloud">{product.stockQty}</span>
      </p>
      <label className="label">Quantity to add</label>
      <input className="field" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      <label className="label mt-4">Note (optional)</label>
      <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier delivery…" />
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy || qty <= 0}>
          {busy ? "Saving…" : `Add ${qty || 0}`}
        </button>
      </div>
    </Modal>
  );
}

function AuditModal({
  audit, onClose, onClosed,
}: {
  audit: StockAudit;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(audit.items.map((i) => [i.id, i.countedQty]))
  );
  const [busy, setBusy] = useState(false);

  const variance = (itemId: string, systemQty: number) =>
    (counts[itemId] ?? systemQty) - systemQty;
  const totalVariance = audit.items.reduce(
    (n, i) => n + Math.abs(variance(i.id, i.systemQty)),
    0
  );

  async function close() {
    setBusy(true);
    try {
      // push any changed counts, then close (posts variances to the ledger)
      await Promise.all(
        audit.items
          .filter((i) => (counts[i.id] ?? i.systemQty) !== i.systemQty)
          .map((i) => api.countAuditItem(audit.id, i.id, counts[i.id]))
      );
      await api.closeAudit(audit.id);
      onClosed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Stock audit · ${audit.reference}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted">
        Enter the physical count for each item. Variances post to the stock ledger
        when you close the audit.
      </p>
      <div className="card max-h-[50vh] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 border-b border-ink-line bg-ink-card">
            <tr>
              <th className="th">Product</th>
              <th className="th text-right">System</th>
              <th className="th text-right">Counted</th>
              <th className="th text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {audit.items.map((i) => {
              const v = variance(i.id, i.systemQty);
              return (
                <tr key={i.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td">{i.product?.name ?? i.productId}</td>
                  <td className="td text-right text-muted">{i.systemQty}</td>
                  <td className="td text-right">
                    <input
                      type="number"
                      className="field w-24 py-1 text-right"
                      value={counts[i.id] ?? i.systemQty}
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [i.id]: Number(e.target.value) }))
                      }
                    />
                  </td>
                  <td className={`td text-right ${v === 0 ? "text-faint" : v > 0 ? "text-whatsapp" : "text-danger"}`}>
                    {v > 0 ? `+${v}` : v}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted">
          Total absolute variance: <span className="text-cloud">{totalVariance}</span>
        </p>
        <div className="flex gap-3">
          <button className="btn-ghost" onClick={onClose}>Close without saving</button>
          <button className="btn-primary" onClick={close} disabled={busy}>
            {busy ? "Posting…" : "Close audit & post variances"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

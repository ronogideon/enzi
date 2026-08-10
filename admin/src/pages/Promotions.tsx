import { useState } from "react";
import { api } from "@/lib/api";
import { formatKes, kesToCents } from "@/lib/money";
import type { Promotion, Product, Category } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync,
} from "@/components/ui";

export default function Promotions() {
  const promos = useAsync(() => api.promotions(), []);
  const products = useAsync(() => api.products("?tier=RETAIL"), []);
  const cats = useAsync(() => api.categories(), []);
  const [creating, setCreating] = useState(false);

  async function toggle(p: Promotion) {
    await api.updatePromotion(p.id, { active: !p.active });
    promos.reload();
  }

  function describe(p: Promotion) {
    if (p.type === "PERCENT") return `${p.value}% off`;
    if (p.type === "FIXED_PRICE") return `Flat ${formatKes(p.value)}`;
    return `${formatKes(p.value)} off`;
  }

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Discount rates applied automatically at checkout"
        action={<button className="btn-primary" onClick={() => setCreating(true)}>New promotion</button>}
      />

      {promos.loading ? (
        <Spinner />
      ) : promos.error ? (
        <EmptyState title="Couldn’t load promotions" hint={promos.error} />
      ) : promos.data!.length === 0 ? (
        <EmptyState title="No promotions yet" hint="Create a rate to run a sale." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Name</th>
                <th className="th">Discount</th>
                <th className="th">Scope</th>
                <th className="th">Tier</th>
                <th className="th">Window</th>
                <th className="th text-center">Active</th>
              </tr>
            </thead>
            <tbody>
              {promos.data!.map((p) => (
                <tr key={p.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td font-medium text-white">{p.name}</td>
                  <td className="td">{describe(p)}</td>
                  <td className="td text-muted">
                    {p.productId ? "Product" : p.categoryId ? "Category" : "—"}
                  </td>
                  <td className="td text-muted">{p.tier ?? "Both"}</td>
                  <td className="td text-xs text-faint">
                    {p.startsAt ? new Date(p.startsAt).toLocaleDateString() : "—"} →{" "}
                    {p.endsAt ? new Date(p.endsAt).toLocaleDateString() : "∞"}
                  </td>
                  <td className="td text-center">
                    <div className="flex justify-center">
                      <Toggle checked={p.active} onChange={() => toggle(p)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <PromoModal
          products={products.data ?? []}
          categories={cats.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); promos.reload(); }}
        />
      )}
    </>
  );
}

function PromoModal({
  products, categories, onClose, onSaved,
}: {
  products: Product[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "PERCENT" as Promotion["type"],
    value: 0,
    tier: "" as "" | "RETAIL" | "WHOLESALE",
    scope: "product" as "product" | "category",
    productId: "",
    categoryId: "",
    startsAt: "",
    endsAt: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setError(null);
    try {
      const value = form.type === "PERCENT" ? Number(form.value) : kesToCents(Number(form.value));
      await api.createPromotion({
        name: form.name,
        type: form.type,
        value,
        tier: form.tier || undefined,
        productId: form.scope === "product" ? form.productId || undefined : undefined,
        categoryId: form.scope === "category" ? form.categoryId || undefined : undefined,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New promotion" onClose={onClose} wide>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mailer Madness" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="field" value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="PERCENT">Percent off</option>
            <option value="FIXED_DISCOUNT">Fixed amount off</option>
            <option value="FIXED_PRICE">Flat price</option>
          </select>
        </div>
        <div>
          <label className="label">{form.type === "PERCENT" ? "Percent (0–100)" : "Amount (Ksh)"}</label>
          <input className="field" type="number" value={form.value} onChange={(e) => set("value", e.target.value)} />
        </div>
        <div>
          <label className="label">Tier</label>
          <select className="field" value={form.tier} onChange={(e) => set("tier", e.target.value)}>
            <option value="">Both tiers</option>
            <option value="RETAIL">Retail only</option>
            <option value="WHOLESALE">Wholesale only</option>
          </select>
        </div>
        <div>
          <label className="label">Applies to</label>
          <select className="field" value={form.scope} onChange={(e) => set("scope", e.target.value)}>
            <option value="product">A product</option>
            <option value="category">A category</option>
          </select>
        </div>
        {form.scope === "product" ? (
          <div className="sm:col-span-2">
            <label className="label">Product</label>
            <select className="field" value={form.productId} onChange={(e) => set("productId", e.target.value)}>
              <option value="">— select —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="label">Category</label>
            <select className="field" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">— select —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Starts (optional)</label>
          <input className="field" type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </div>
        <div>
          <label className="label">Ends (optional)</label>
          <input className="field" type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || !form.name}>
          {busy ? "Saving…" : "Create promotion"}
        </button>
      </div>
    </Modal>
  );
}

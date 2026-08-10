import { useState } from "react";
import { api } from "@/lib/api";
import { formatKes, kesToCents, centsToKes } from "@/lib/money";
import type { Product, Category } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync,
} from "@/components/ui";

export default function Products() {
  const products = useAsync(() => api.products("?tier=RETAIL"), []);
  const cats = useAsync(() => api.categories(), []);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  async function toggleField(p: Product, field: "featured" | "active", value: boolean) {
    await api.updateProduct(p.id, { [field]: value });
    products.reload();
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Your catalogue — prices, stock, and visibility"
        action={<button className="btn-primary" onClick={() => setCreating(true)}>Add product</button>}
      />

      {products.loading ? (
        <Spinner />
      ) : products.error ? (
        <EmptyState title="Couldn’t load products" hint={products.error} />
      ) : products.data!.length === 0 ? (
        <EmptyState title="No products yet" hint="Add your first product to get started." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Product</th>
                <th className="th">Category</th>
                <th className="th text-right">Retail</th>
                <th className="th text-right">Wholesale</th>
                <th className="th text-right">Stock</th>
                <th className="th text-center">Featured</th>
                <th className="th text-center">Active</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {products.data!.map((p) => (
                <tr key={p.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td font-medium text-white">{p.name}</td>
                  <td className="td text-muted">{p.category?.name ?? "—"}</td>
                  <td className="td text-right">{formatKes(p.retailPrice)}</td>
                  <td className="td text-right text-muted">
                    {p.wholesalePrice ? formatKes(p.wholesalePrice) : "—"}
                  </td>
                  <td className="td text-right">
                    <Badge tone={p.stockQty <= 10 ? "gold" : "muted"}>{p.stockQty}</Badge>
                  </td>
                  <td className="td text-center">
                    <div className="flex justify-center">
                      <Toggle checked={p.featured} onChange={(v) => toggleField(p, "featured", v)} />
                    </div>
                  </td>
                  <td className="td text-center">
                    <div className="flex justify-center">
                      <Toggle checked={p.active} onChange={(v) => toggleField(p, "active", v)} />
                    </div>
                  </td>
                  <td className="td text-right">
                    <button className="text-sm text-indigo hover:underline" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ProductModal
          product={editing}
          categories={cats.data ?? []}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); products.reload(); }}
        />
      )}
    </>
  );
}

function ProductModal({
  product, categories, onClose, onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.categoryId ?? "",
    retailPrice: product ? centsToKes(product.retailPrice) : 0,
    wholesalePrice: product?.wholesalePrice ? centsToKes(product.wholesalePrice) : 0,
    retailMinQty: product?.retailMinQty ?? 1,
    wholesaleMinQty: product?.wholesaleMinQty ?? 1,
    stockQty: product?.stockQty ?? 0,
    featured: product?.featured ?? false,
    images: (product?.images ?? []).map((i) => i.url).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        retailPrice: kesToCents(Number(form.retailPrice)),
        wholesalePrice: form.wholesalePrice ? kesToCents(Number(form.wholesalePrice)) : undefined,
        retailMinQty: Number(form.retailMinQty),
        wholesaleMinQty: Number(form.wholesaleMinQty),
        stockQty: Number(form.stockQty),
        featured: form.featured,
      };
      if (!product) {
        // images only settable on create in this API
        const urls = form.images.split("\n").map((s) => s.trim()).filter(Boolean);
        if (urls.length) payload.images = urls.map((url) => ({ url }));
        await api.createProduct(payload);
      } else {
        await api.updateProduct(product.id, payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={product ? "Edit product" : "Add product"} onClose={onClose} wide>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea className="field min-h-20" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="field" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Stock quantity</label>
          <input className="field" type="number" value={form.stockQty} onChange={(e) => set("stockQty", e.target.value)} />
        </div>
        <div>
          <label className="label">Retail price (Ksh)</label>
          <input className="field" type="number" value={form.retailPrice} onChange={(e) => set("retailPrice", e.target.value)} />
        </div>
        <div>
          <label className="label">Wholesale price (Ksh)</label>
          <input className="field" type="number" value={form.wholesalePrice} onChange={(e) => set("wholesalePrice", e.target.value)} />
        </div>
        <div>
          <label className="label">Retail min qty</label>
          <input className="field" type="number" value={form.retailMinQty} onChange={(e) => set("retailMinQty", e.target.value)} />
        </div>
        <div>
          <label className="label">Wholesale min qty</label>
          <input className="field" type="number" value={form.wholesaleMinQty} onChange={(e) => set("wholesaleMinQty", e.target.value)} />
        </div>
        {!product && (
          <div className="sm:col-span-2">
            <label className="label">Image URLs (one per line)</label>
            <textarea className="field min-h-20" value={form.images} onChange={(e) => set("images", e.target.value)} placeholder="https://…" />
          </div>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Toggle checked={form.featured} onChange={(v) => set("featured", v)} />
          <span className="text-sm text-cloud">Featured on storefront</span>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || !form.name}>
          {busy ? "Saving…" : "Save product"}
        </button>
      </div>
    </Modal>
  );
}

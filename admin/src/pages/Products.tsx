import { useMemo, useState } from "react";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatKes, kesToCents, centsToKes } from "@/lib/money";
import type { Product, Category, ProductImage } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync,
} from "@/components/ui";
import { ImageUploader } from "@/components/ImageUploader";

type Filter = "all" | "active" | "hidden" | "lowstock";

export default function Products() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const products = useAsync(() => api.allProducts(), []);
  const cats = useAsync(() => api.categories(), []);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const rows = products.data ?? [];
    const q = search.trim().toLowerCase();
    return rows
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .filter((p) => {
        if (filter === "active") return p.active;
        if (filter === "hidden") return !p.active;
        if (filter === "lowstock") return p.stockQty <= 10;
        return true;
      });
  }, [products.data, search, filter]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      products.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusyId(null);
    }
  }

  const toggleField = (p: Product, field: "featured" | "active", value: boolean) =>
    run(p.id, () => api.updateProduct(p.id, { [field]: value }));

  function remove(p: Product) {
    const ordered = p._count?.orderItems ?? 0;
    if (ordered > 0) {
      if (!confirm(
        `"${p.name}" appears on ${ordered} past order line(s), so it can't be permanently deleted without breaking order history.\n\nHide it instead? It disappears from the shop immediately.`
      )) return;
      return run(p.id, () => api.hideProduct(p.id));
    }
    if (!confirm(`Permanently delete "${p.name}"? This can't be undone.`)) return;
    return run(p.id, () => api.deleteProductForever(p.id));
  }

  const counts = {
    all: products.data?.length ?? 0,
    active: products.data?.filter((p) => p.active).length ?? 0,
    hidden: products.data?.filter((p) => !p.active).length ?? 0,
    lowstock: products.data?.filter((p) => p.stockQty <= 10).length ?? 0,
  };

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Your catalogue — photos, prices, stock and visibility"
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Add product
          </button>
        }
      />

      {error && (
        <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          className="field max-w-xs"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {([
            ["all", `All (${counts.all})`],
            ["active", `In shop (${counts.active})`],
            ["hidden", `Hidden (${counts.hidden})`],
            ["lowstock", `Low stock (${counts.lowstock})`],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                filter === key
                  ? "border-white/40 text-white"
                  : "border-ink-line text-muted hover:text-cloud"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {products.loading ? (
        <Spinner />
      ) : products.error ? (
        <EmptyState title="Couldn't load products" hint={products.error} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={search || filter !== "all" ? "Nothing matches" : "No products yet"}
          hint={
            search || filter !== "all"
              ? "Try a different search or filter."
              : "Add your first product to get started."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Product</th>
                <th className="th">Category</th>
                <th className="th text-right">Retail</th>
                <th className="th text-right">Wholesale</th>
                <th className="th text-right">Stock</th>
                <th className="th text-center">Featured</th>
                <th className="th text-center">In shop</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-ink-line/60 last:border-0 ${
                    busyId === p.id ? "opacity-50" : ""
                  }`}
                >
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-ink-line bg-ink-800">
                        {p.images?.[0] ? (
                          <img
                            src={mediaUrl(p.images[0].url)}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-faint">
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{p.name}</p>
                        <p className="text-xs text-faint">
                          {p.images?.length ?? 0} photo{p.images?.length === 1 ? "" : "s"}
                          {p.retailMinQty > 1 && ` · min ${p.retailMinQty}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="td text-muted">{p.category?.name ?? "—"}</td>
                  <td className="td text-right">{formatKes(p.retailPrice)}</td>
                  <td className="td text-right text-muted">
                    {p.wholesalePrice ? formatKes(p.wholesalePrice) : "—"}
                  </td>
                  <td className="td text-right">
                    <Badge tone={p.stockQty <= 0 ? "danger" : p.stockQty <= 10 ? "gold" : "muted"}>
                      {p.stockQty}
                    </Badge>
                  </td>
                  <td className="td text-center">
                    <div className="flex justify-center">
                      <Toggle
                        checked={p.featured}
                        onChange={(v) => toggleField(p, "featured", v)}
                      />
                    </div>
                  </td>
                  <td className="td text-center">
                    <div className="flex justify-center">
                      <Toggle checked={p.active} onChange={(v) => toggleField(p, "active", v)} />
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-3 text-sm">
                      <button className="text-indigo hover:underline" onClick={() => setEditing(p)}>
                        Edit
                      </button>
                      <button
                        className="text-muted hover:text-cloud"
                        onClick={() => run(p.id, () => api.duplicateProduct(p.id))}
                      >
                        Duplicate
                      </button>
                      {can(["SUPERADMIN", "ADMIN"]) && (
                        <button className="text-muted hover:text-danger" onClick={() => remove(p)}>
                          Delete
                        </button>
                      )}
                    </div>
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
    sku: product?.sku ?? "",
    categoryId: product?.categoryId ?? "",
    retailPrice: product ? String(centsToKes(product.retailPrice)) : "",
    wholesalePrice: product?.wholesalePrice ? String(centsToKes(product.wholesalePrice)) : "",
    retailMinQty: String(product?.retailMinQty ?? 1),
    wholesaleMinQty: String(product?.wholesaleMinQty ?? 1),
    stockQty: String(product?.stockQty ?? 0),
    featured: product?.featured ?? false,
    active: product?.active ?? true,
  });
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const num = (v: string, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const valid =
    form.name.trim().length > 0 &&
    num(form.retailPrice, -1) >= 0 &&
    form.retailPrice !== "";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        sku: form.sku.trim() || null,
        categoryId: form.categoryId || null,
        retailPrice: kesToCents(num(form.retailPrice)),
        wholesalePrice: form.wholesalePrice ? kesToCents(num(form.wholesalePrice)) : null,
        retailMinQty: Math.max(1, num(form.retailMinQty, 1)),
        wholesaleMinQty: Math.max(1, num(form.wholesaleMinQty, 1)),
        stockQty: num(form.stockQty),
        featured: form.featured,
        active: form.active,
        // Always send the full ordered list — the API treats it as a replacement,
        // so adds, removals and reordering are all one operation.
        images: images.map((im) => ({
          url: im.url,
          alt: im.alt ?? undefined,
          mediaId: im.mediaId ?? undefined,
        })),
      };

      if (product) await api.updateProduct(product.id, payload);
      else await api.createProduct(payload);
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

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="White Polymailer Packaging Bags"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="field min-h-28"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What it's made of, what sizes it comes in, what it's good for…"
          />
          <p className="mt-1 text-xs text-faint">Shown on the product page in the shop.</p>
        </div>

        <div className="sm:col-span-2">
          <ImageUploader images={images} onChange={setImages} />
        </div>

        <div>
          <label className="label">Category</label>
          <select
            className="field"
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">SKU (optional)</label>
          <input className="field" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
        </div>

        <div>
          <label className="label">Retail price (Ksh)</label>
          <input
            className="field"
            type="number"
            min="0"
            value={form.retailPrice}
            onChange={(e) => set("retailPrice", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Wholesale price (Ksh)</label>
          <input
            className="field"
            type="number"
            min="0"
            value={form.wholesalePrice}
            onChange={(e) => set("wholesalePrice", e.target.value)}
            placeholder="leave blank if none"
          />
        </div>

        <div>
          <label className="label">Retail minimum quantity</label>
          <input
            className="field"
            type="number"
            min="1"
            value={form.retailMinQty}
            onChange={(e) => set("retailMinQty", e.target.value)}
          />
          <p className="mt-1 text-xs text-faint">Carts below this are raised to it at checkout.</p>
        </div>
        <div>
          <label className="label">Wholesale minimum quantity</label>
          <input
            className="field"
            type="number"
            min="1"
            value={form.wholesaleMinQty}
            onChange={(e) => set("wholesaleMinQty", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Stock quantity</label>
          <input
            className="field"
            type="number"
            value={form.stockQty}
            onChange={(e) => set("stockQty", e.target.value)}
          />
        </div>

        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center gap-3">
            <Toggle checked={form.featured} onChange={(v) => set("featured", v)} />
            <span className="text-sm text-cloud">Featured on the homepage</span>
          </label>
          <label className="flex items-center gap-3">
            <Toggle checked={form.active} onChange={(v) => set("active", v)} />
            <span className="text-sm text-cloud">Visible in the shop</span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || !valid}>
          {busy ? "Saving…" : product ? "Save changes" : "Add product"}
        </button>
      </div>
    </Modal>
  );
}

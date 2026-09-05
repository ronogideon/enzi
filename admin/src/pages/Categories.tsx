import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Category } from "@/lib/types";
import { PageHeader, Spinner, EmptyState, Toggle, useAsync } from "@/components/ui";
import { Icon } from "@/components/Icons";

/**
 * Categories.
 *
 * These were creatable through the API but had no screen, so in practice the
 * shop had no way to make one — every product ended up uncategorised and the
 * storefront's category navigation was empty.
 *
 * Editing is inline: a category is a name and a sentence, and opening a dialog
 * to change a word is more ceremony than that deserves. Order is set with
 * up/down buttons, which is what customers see in the shop menu.
 */
export default function Categories() {
  const categories = useAsync(() => api.categoriesAll(), []);
  const [items, setItems] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (categories.data) setItems(categories.data);
  }, [categories.data]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      categories.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);

    setSavingOrder(true);
    try {
      await api.reorderCategories(next.map((c) => c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the new order");
      categories.reload();
    } finally {
      setSavingOrder(false);
    }
  }

  async function remove(category: Category) {
    const count = category._count?.products ?? 0;
    const message =
      count > 0
        ? `Delete "${category.name}"?\n\n${count} product(s) will become uncategorised — they stay in the shop, they just won't appear under this heading.`
        : `Delete "${category.name}"?`;
    if (!confirm(message)) return;
    await run(() => api.deleteCategory(category.id, count > 0));
  }

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="How products are grouped in your shop's menu"
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Icon.Plus className="h-4 w-4" />
            New category
          </button>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Icon.Alert className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      )}

      {creating && (
        <CategoryForm
          onCancel={() => setCreating(false)}
          onSave={async (values) => {
            await run(() => api.createCategory(values));
            setCreating(false);
          }}
        />
      )}

      {categories.loading ? (
        <Spinner />
      ) : categories.error ? (
        <EmptyState title="Couldn't load categories" hint={categories.error} />
      ) : items.length === 0 && !creating ? (
        <EmptyState
          title="No categories yet"
          hint="Group your products — Mailers, Boxes, Tape, Ribbons. Customers browse by these."
        />
      ) : (
        <div className={`space-y-3 ${savingOrder ? "opacity-70" : ""}`}>
          {items.map((cat, i) =>
            editingId === cat.id ? (
              <CategoryForm
                key={cat.id}
                category={cat}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  await run(() => api.updateCategory(cat.id, values));
                  setEditingId(null);
                }}
              />
            ) : (
              <div key={cat.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-ink-hover hover:text-cloud disabled:opacity-25"
                      aria-label="Move up"
                    >
                      <Icon.ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-ink-hover hover:text-cloud disabled:opacity-25"
                      aria-label="Move down"
                    >
                      <Icon.ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{cat.name}</p>
                    {cat.description && (
                      <p className="mt-0.5 text-sm text-muted">{cat.description}</p>
                    )}
                    <p className="mt-1 text-xs text-faint">
                      {cat._count?.products ?? 0} product
                      {(cat._count?.products ?? 0) === 1 ? "" : "s"} · /{cat.slug}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Toggle
                      checked={cat.active ?? true}
                      onChange={(v) => run(() => api.updateCategory(cat.id, { active: v }))}
                      label="Visible in the shop"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2 border-t border-ink-line pt-3">
                  <button className="btn-ghost text-xs" onClick={() => setEditingId(cat.id)}>
                    <Icon.Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    className="btn-danger px-2.5 text-xs"
                    onClick={() => remove(cat)}
                    aria-label={`Delete ${cat.name}`}
                  >
                    <Icon.Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}

function CategoryForm({
  category,
  onSave,
  onCancel,
}: {
  category?: Category;
  onSave: (values: { name: string; description?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-3 border-indigo/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input
            className="field"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Mailers &amp; Polybags"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim().length > 1) submit();
            }}
          />
        </div>
        <div>
          <label className="label">Short description (optional)</label>
          <input
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown on the category page"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary text-sm"
          onClick={submit}
          disabled={busy || name.trim().length < 2}
        >
          {busy ? "Saving…" : category ? "Save changes" : "Add category"}
        </button>
      </div>
    </div>
  );
}

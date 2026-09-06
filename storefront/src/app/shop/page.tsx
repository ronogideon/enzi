import Link from "next/link";
import { api } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/types";

export const metadata = {
  title: "Shop all products",
  description:
    "Browse every packaging product we stock — polymailers, boxes, tape, ribbon and more. Live prices and stock, with automatic wholesale rates on bulk orders.",
};

const PRICE_BANDS: Record<string, [number, number]> = {
  "under-1000": [0, 100000],
  "1000-5000": [100000, 500000],
  "5000-plus": [500000, Number.MAX_SAFE_INTEGER],
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { category?: string; search?: string; price?: string; sort?: string };
}) {
  const [categories, products] = await Promise.all([
    api.categories(),
    api.products({ category: searchParams.category, search: searchParams.search }),
  ]);

  let list: Product[] = [...products];

  // price band (client-set via query param; filtered on effective price)
  const band = searchParams.price ? PRICE_BANDS[searchParams.price] : null;
  if (band)
    list = list.filter((p) => {
      const price = p.effectivePrice ?? p.retailPrice;
      return price >= band[0] && price < band[1];
    });

  // sort
  if (searchParams.sort === "price-asc")
    list.sort((a, b) => (a.effectivePrice ?? a.retailPrice) - (b.effectivePrice ?? b.retailPrice));
  else if (searchParams.sort === "price-desc")
    list.sort((a, b) => (b.effectivePrice ?? b.retailPrice) - (a.effectivePrice ?? a.retailPrice));
  else if (searchParams.sort === "name")
    list.sort((a, b) => a.name.localeCompare(b.name));

  const activeCat = searchParams.category;
  const withParam = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const qs = q.toString();
    return `/shop${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      {/* page head */}
      <section className="border-b border-ink-line">
        <div className="shell py-16">
          <h1 className="display text-4xl md:text-5xl">Our shop</h1>
          <p className="mt-3 max-w-lg text-muted">
            Explore our full range of professional packaging solutions.
          </p>
        </div>
      </section>

      <div className="shell grid gap-10 py-12 lg:grid-cols-[260px_1fr]">
        {/* sidebar — in normal flow, never floats over the grid */}
        <aside className="space-y-8">
          <div>
            <p className="eyebrow mb-4 border-b border-ink-line pb-3">Categories</p>
            <ul className="space-y-1">
              <li>
                <Link
                  href={withParam({ category: undefined })}
                  className={`block rounded-lg px-4 py-2.5 text-sm ${
                    !activeCat ? "bg-ink-hover text-white" : "text-muted hover:bg-ink-hover"
                  }`}
                >
                  All products
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={withParam({ category: c.slug })}
                    className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
                      activeCat === c.slug
                        ? "bg-ink-hover text-white"
                        : "text-muted hover:bg-ink-hover"
                    }`}
                  >
                    <span>{c.name}</span>
                    {c._count && <span className="text-xs text-faint">{c._count.products}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4 border-b border-ink-line pb-3">Price range</p>
            <ul className="space-y-1">
              {[
                { key: "under-1000", label: "Under Ksh 1,000" },
                { key: "1000-5000", label: "Ksh 1,000 – 5,000" },
                { key: "5000-plus", label: "Ksh 5,000+" },
              ].map((b) => (
                <li key={b.key}>
                  <Link
                    href={withParam({
                      price: searchParams.price === b.key ? undefined : b.key,
                    })}
                    className={`block rounded-lg px-4 py-2.5 text-sm ${
                      searchParams.price === b.key
                        ? "bg-ink-hover text-white"
                        : "text-muted hover:bg-ink-hover"
                    }`}
                  >
                    {b.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* grid */}
        <div>
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {list.length} result{list.length === 1 ? "" : "s"}
              {searchParams.search && (
                <>
                  {" "}for “<span className="text-cloud">{searchParams.search}</span>”
                </>
              )}
            </p>
            <div className="flex gap-2 text-xs">
              {[
                { key: undefined, label: "Default" },
                { key: "price-asc", label: "Price ↑" },
                { key: "price-desc", label: "Price ↓" },
                { key: "name", label: "A–Z" },
              ].map((s) => (
                <Link
                  key={s.label}
                  href={withParam({ sort: s.key })}
                  className={`rounded-full border px-3 py-1.5 ${
                    (searchParams.sort ?? undefined) === s.key
                      ? "border-white/40 text-white"
                      : "border-ink-line text-muted hover:text-cloud"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <div className="card grid place-items-center px-6 py-24 text-center">
              <p className="font-display text-xl text-white">No products found</p>
              <p className="mt-2 text-sm text-muted">
                Try a different category or clear your filters.
              </p>
              <Link href="/shop" className="btn-ghost mt-6">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="stagger grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

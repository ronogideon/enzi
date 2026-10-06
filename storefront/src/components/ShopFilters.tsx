"use client";

import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

/**
 * Mobile-only filter bar for /shop. On a phone the sidebar lists stacked above
 * the grid pushed the first product a long way down the page; native selects
 * keep the whole bar to two short rows and open the phone's own picker.
 */
export function ShopFilters({
  categories,
  priceBands,
  sorts,
  current,
}: {
  categories: Option[];
  priceBands: Option[];
  sorts: Option[];
  current: { category?: string; search?: string; price?: string; sort?: string };
}) {
  const router = useRouter();

  function go(patch: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) q.set(k, v);
    const qs = q.toString();
    router.push(`/shop${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:hidden">
      <Select
        label="Category"
        className="col-span-2"
        value={current.category ?? ""}
        onChange={(v) => go({ category: v || undefined })}
        options={[{ value: "", label: "All products" }, ...categories]}
      />
      <Select
        label="Price"
        value={current.price ?? ""}
        onChange={(v) => go({ price: v || undefined })}
        options={[{ value: "", label: "Any price" }, ...priceBands]}
      />
      <Select
        label="Sort"
        value={current.sort ?? ""}
        onChange={(v) => go({ sort: v || undefined })}
        options={sorts}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  className?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-4 top-1.5 text-[10px] uppercase tracking-widest text-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field appearance-none pb-2 pr-10 pt-5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 7.5l5 5 5-5" />
      </svg>
    </label>
  );
}

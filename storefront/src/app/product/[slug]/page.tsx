import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { ProductGallery } from "@/components/ProductGallery";
import { AddToCartPanel } from "@/components/AddToCartPanel";
import { ProductCard } from "@/components/ProductCard";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await api.product(params.slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.description ?? `${product.name} — Enzi Packaging`,
  };
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await api.product(params.slug);
  if (!product) notFound();

  const related = product.categoryId
    ? (await api.products({ category: product.category?.slug })).filter(
        (p) => p.id !== product.id
      )
    : [];

  const base = product.retailPrice;
  const effective = product.effectivePrice ?? base;
  const onSale = effective < base;

  return (
    <div className="shell py-12">
      <nav className="mb-8 text-sm text-faint">
        <Link href="/shop" className="hover:text-cloud">
          Shop
        </Link>
        {product.category && (
          <>
            {" / "}
            <Link href={`/shop?category=${product.category.slug}`} className="hover:text-cloud">
              {product.category.name}
            </Link>
          </>
        )}
        {" / "}
        <span className="text-muted">{product.name}</span>
      </nav>

      <div className="grid animate-rise gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
        {/* gallery */}
        <ProductGallery images={product.images ?? []} name={product.name} />

        {/* info */}
        <div>
          {product.category && (
            <p className="eyebrow">{product.category.name}</p>
          )}
          <h1 className="display mt-3 text-3xl md:text-4xl">{product.name}</h1>

          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {product.stockQty > 0 ? (
              <span className="text-whatsapp">In stock</span>
            ) : (
              <span className="text-faint">Currently out of stock</span>
            )}
            {onSale && (
              <>
                <span aria-hidden>·</span>
                <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">
                  Sale
                </span>
                <span className="text-faint line-through">{formatKes(base)}</span>
              </>
            )}
          </p>

          {product.description && (
            <p className="mt-6 leading-relaxed text-muted">
              {product.description}
            </p>
          )}

          <AddToCartPanel product={product} />
        </div>
      </div>

      {/* related */}
      {related.length > 0 && (
        <section className="mt-24">
          <h2 className="display mb-8 text-2xl md:text-3xl">You may also like</h2>
          <div className="stagger grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

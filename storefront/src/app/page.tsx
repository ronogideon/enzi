import Link from "next/link";
import { api } from "@/lib/api";
import { HeroCarousel, type HeroSlide } from "@/components/HeroCarousel";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeader, StarRating } from "@/components/ui";

export default async function HomePage() {
  const [featured, reviews, faqs] = await Promise.all([
    api.featured(),
    api.reviews(),
    api.faqs(),
  ]);

  const slides: HeroSlide[] =
    featured.length > 0
      ? featured.map((p) => ({
          title: p.name,
          subtitle: p.description?.slice(0, 60) ?? "Packaging you can trust",
          href: `/product/${p.slug}`,
          imageUrl: p.images?.[0]?.url,
        }))
      : FALLBACK_SLIDES;

  return (
    <>
      <HeroCarousel slides={slides} />

      {/* Why Enzi */}
      <section className="shell py-24 text-center">
        <p className="eyebrow">Why Enzi</p>
        <h2 className="display mx-auto mt-3 max-w-2xl text-4xl md:text-5xl">
          Packaging you can trust
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-muted">
          Premium, sustainable packaging tailored for e-commerce brands and
          businesses across Kenya.
        </p>
        <div className="stagger mt-14 grid gap-6 md:grid-cols-3">
          {WHY.map((w) => (
            <div key={w.title} className="card p-8 text-left">
              <div className="grid h-12 w-12 place-items-center rounded-xl border border-ink-line text-2xl">
                {w.icon}
              </div>
              <h3 className="mt-5 font-display text-xl font-bold text-white">
                {w.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured products */}
      {featured.length > 0 && (
        <section className="shell py-8">
          <SectionHeader
            eyebrow="Shop"
            title="Featured products"
            action={{ label: "View all products", href: "/shop" }}
          />
          <div className="stagger grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {reviews.length > 0 && (
        <section className="shell py-24">
          <SectionHeader
            eyebrow="Testimonials"
            title="What our customers say"
            action={{ label: "All reviews", href: "/reviews" }}
          />
          <div className="stagger grid gap-6 md:grid-cols-2">
            {reviews.slice(0, 2).map((r) => (
              <figure key={r.id} className="card p-8">
                <StarRating value={r.rating} />
                <blockquote className="mt-4 text-lg leading-relaxed text-cloud">
                  “{r.body}”
                </blockquote>
                <figcaption className="mt-4 font-display font-bold text-white">
                  {r.authorName}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* FAQ teaser */}
      {faqs.length > 0 && (
        <section className="shell py-8 text-center">
          <p className="eyebrow">Support</p>
          <h2 className="display mx-auto mt-3 max-w-2xl text-4xl md:text-5xl">
            Frequently asked questions
          </h2>
          <div className="mx-auto mt-10 max-w-3xl space-y-3 text-left">
            {faqs.slice(0, 4).map((f) => (
              <details key={f.id} className="card group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-white">
                  {f.question}
                  <span className="text-muted transition-transform group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {f.answer}
                </p>
              </details>
            ))}
          </div>
          <Link href="/faqs" className="mt-8 inline-block text-sm font-semibold uppercase tracking-wider text-muted hover:text-cloud">
            View all FAQs →
          </Link>
        </section>
      )}

      {/* CTA */}
      <section className="shell py-28 text-center">
        <h2 className="display mx-auto max-w-2xl text-4xl md:text-5xl">
          Ready to elevate your packaging?
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-muted">
          Explore our full range of premium packaging materials or get in touch
          for a custom quote.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/shop" className="btn-primary px-8">
            Shop now
          </Link>
          <Link href="/contact" className="btn-ghost px-8">
            Contact us
          </Link>
        </div>
      </section>
    </>
  );
}

const WHY = [
  {
    icon: "🌿",
    title: "Sustainable",
    body: "Eco-friendly materials that protect your products and the planet.",
  },
  {
    icon: "🚚",
    title: "Fast delivery",
    body: "Countrywide delivery via our own fleet, Matatu parcel, and Pickup Mtaani.",
  },
  {
    icon: "📦",
    title: "Built to protect",
    body: "Durable mailers and bags engineered to keep every order safe in transit.",
  },
];

const FALLBACK_SLIDES: HeroSlide[] = [
  { title: "Clear Self Sealing Bags", subtitle: "Pack clothing, wigs, toys, foodstuffs, thrifts, and more", href: "/shop" },
  { title: "Bubble Mailer", subtitle: "Wrap to protect", href: "/shop" },
  { title: "Organza Mesh Bags", subtitle: "Elegant, breathable packaging", href: "/shop" },
];

import Link from "next/link";
import { api } from "@/lib/api";
import { SmartImage } from "@/components/ui";

export const metadata = {
  description:
    "Guides and articles on packaging your products well — choosing materials, cutting shipping costs, and presenting orders your customers remember.", title: "News & Blogs" };

export default async function BlogPage() {
  const posts = await api.blog();
  return (
    <div className="shell py-16">
      <div className="text-center">
        <p className="eyebrow">Insights &amp; news</p>
        <h1 className="display mx-auto mt-3 max-w-2xl text-4xl md:text-5xl">
          News &amp; Blogs
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-muted">
          Tips, trends, and sustainable solutions for modern packaging — curated
          by the Enzi team.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="card mt-16 grid place-items-center px-6 py-20 text-center">
          <p className="text-muted">No blog posts available yet. Check back soon.</p>
        </div>
      ) : (
        <div className="stagger mt-14 grid gap-8 md:grid-cols-3">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="card lift zoom-frame overflow-hidden"
            >
              <SmartImage
                src={p.coverImage}
                alt={p.title}
                className="aspect-video w-full object-cover"
              />
              <div className="p-6">
                <h2 className="font-display text-lg font-bold text-white">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="mt-2 text-sm text-muted">{p.excerpt}</p>
                )}
                <span className="mt-4 inline-block text-xs font-semibold uppercase tracking-wider text-muted">
                  Read article →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

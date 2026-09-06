import type { MetadataRoute } from "next";
import { api } from "@/lib/api";

/**
 * Dynamic sitemap.
 *
 * Generated at request time from live data rather than hand-maintained, so a
 * product or blog post added in the admin is discoverable by search engines
 * without anyone remembering to update a file.
 *
 * `changeFrequency` and `priority` are hints, not instructions — Google largely
 * ignores them now — but `lastModified` genuinely helps crawlers skip pages
 * that haven't changed, so it's set from real timestamps where we have them.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await api.siteConfig();
  const base = (site.seo.siteUrl || "https://enzipackaging.com").replace(/\/+$/, "");

  const [products, categories, posts] = await Promise.all([
    api.products(),
    api.categories(),
    api.blog(),
  ]);

  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/delivery`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/faqs`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/reviews`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];

  const productPages: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.slug}`,
    lastModified: p.createdAt ? new Date(p.createdAt) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categoryPages: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${base}/shop?category=${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const postPages: MetadataRoute.Sitemap = posts.map((b) => ({
    url: `${base}/blog/${b.slug}`,
    lastModified: b.publishedAt ? new Date(b.publishedAt) : new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Account, cart, checkout and order pages are deliberately absent: they're
  // per-user or transactional, and indexing them wastes crawl budget on pages
  // that can never rank.
  return [...staticPages, ...productPages, ...categoryPages, ...postPages];
}

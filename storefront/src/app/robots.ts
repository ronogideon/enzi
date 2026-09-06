import type { MetadataRoute } from "next";
import { api } from "@/lib/api";

/**
 * robots.txt.
 *
 * Blocks the pages that can never rank and would otherwise eat crawl budget:
 * a customer's account, their cart, checkout, and individual order receipts
 * (which are per-order URLs that shouldn't be in an index at all).
 */
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await api.siteConfig();
  const base = (site.seo.siteUrl || "https://enzipackaging.com").replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/account/", "/cart", "/checkout", "/order/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

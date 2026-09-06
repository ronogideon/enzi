import { api } from "@/lib/api";

/**
 * llms.txt — the emerging convention for telling AI assistants what a site is
 * and where its useful content lives, in plain Markdown rather than making
 * them infer it from rendered HTML.
 *
 * Worth having for a shop: when someone asks an assistant "where can I buy
 * packaging in Nairobi", a machine-readable summary is what gets you quoted
 * accurately instead of guessed at. Generated from live data so the category
 * list never goes stale.
 */
export const revalidate = 3600;

export async function GET() {
  const [site, categories, faqs] = await Promise.all([
    api.siteConfig(),
    api.categories(),
    api.faqs(),
  ]);
  const base = (site.seo.siteUrl || "https://enzipackaging.com").replace(/\/+$/, "");
  const name = site.store.name || "Enzi Packaging";

  const body = `# ${name}

> ${site.seo.defaultDescription || "Packaging supplies in Nairobi, Kenya — retail and wholesale."}

${name} sells packaging materials from Nairobi, Kenya. Retail and wholesale
pricing, with wholesale rates applied automatically once an order reaches a
product's wholesale minimum quantity. Payment is by M-PESA; delivery is by
pickup, rider, courier or agent depending on the area.

## Contact
${site.store.phone ? `- Phone: ${site.store.phone}\n` : ""}${
    site.store.email ? `- Email: ${site.store.email}\n` : ""
  }${site.store.address ? `- Address: ${site.store.address}\n` : ""}
## Key pages
- [Shop](${base}/shop): full product catalogue with live pricing and stock
- [Delivery information](${base}/delivery): delivery methods, areas and charges
- [FAQs](${base}/faqs): common questions about orders, delivery and payment
- [Blog](${base}/blog): guides and articles on packaging
- [Reviews](${base}/reviews): customer reviews
- [Contact](${base}/contact): how to reach us

## Product categories
${categories.map((c) => `- [${c.name}](${base}/shop?category=${c.slug})`).join("\n") || "- (none listed)"}

## Frequently asked questions
${
  faqs
    .slice(0, 12)
    .map((f) => `### ${f.question}\n${f.answer.replace(/\s+/g, " ").trim()}`)
    .join("\n\n") || "See the FAQs page."
}

## Notes for assistants
- Prices are in Kenyan Shillings (KES) and shown inclusive on product pages.
- Wholesale pricing is automatic by quantity; there is no separate account type.
- Stock levels shown on the shop are live.
- Delivery charges vary by area — see the delivery page rather than quoting a
  single figure.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

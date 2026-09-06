import Link from "next/link";
import { SocialRow } from "./SocialRail";
import type { SiteConfig } from "@/lib/api";

/**
 * Site footer.
 *
 * Socials here are the same settings-driven, clickable brand icons as the side
 * rail — previously they were dead single letters in circles, which looked like
 * links but did nothing.
 */
export function Footer({ site }: { site: SiteConfig }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-ink-line bg-ink-800/40">
      <div className="shell grid gap-12 py-16 md:grid-cols-4">
        <div className="md:col-span-1">
          <p className="font-display text-2xl font-extrabold tracking-tight text-white">
            {site.store.name || "ENZI PACKAGING"}
          </p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Premium, sustainable packaging for e-commerce brands and businesses
            across Kenya.
          </p>

          <div className="mt-6 space-y-1 text-sm text-muted">
            {site.store.phone && (
              <p>
                <a href={`tel:${site.store.phone}`} className="transition-colors hover:text-cloud">
                  {site.store.phone}
                </a>
              </p>
            )}
            {site.store.email && (
              <p>
                <a
                  href={`mailto:${site.store.email}`}
                  className="break-all transition-colors hover:text-cloud"
                >
                  {site.store.email}
                </a>
              </p>
            )}
            {site.store.address && <p className="text-faint">{site.store.address}</p>}
          </div>
        </div>

        <FooterCol
          title="Shop"
          links={[
            { label: "All products", href: "/shop" },
            { label: "Delivery & charges", href: "/delivery" },
            { label: "Reviews & ratings", href: "/reviews" },
            { label: "News & blog", href: "/blog" },
            { label: "FAQs", href: "/faqs" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { label: "Contact us", href: "/contact" },
            { label: "Privacy policy", href: "/contact" },
            { label: "Terms & conditions", href: "/contact" },
            { label: "Refund policy", href: "/contact" },
            // A human-visible sitemap link. Search engines find sitemap.xml via
            // robots.txt, but people (and some crawlers) look for it here.
            { label: "Sitemap", href: "/sitemap.xml" },
          ]}
        />

        <div>
          <p className="eyebrow mb-4 border-b border-ink-line pb-3">Follow us</p>
          <p className="text-sm text-muted">Stay connected on social media.</p>
          <div className="mt-4">
            <SocialRow socials={site.socials} />
          </div>
        </div>
      </div>

      <div className="border-t border-ink-line">
        <div className="shell flex flex-col items-center justify-between gap-2 py-5 text-xs text-faint sm:flex-row">
          <p>© {year} {site.store.name || "Enzi Packaging"}. All rights reserved.</p>
          <p className="flex flex-wrap items-center gap-x-2">
            <Link href="/contact" className="transition-colors hover:text-muted">
              Privacy Policy
            </Link>
            <span aria-hidden>|</span>
            <Link href="/contact" className="transition-colors hover:text-muted">
              Terms of Service
            </Link>
            <span aria-hidden>|</span>
            <a href="/sitemap.xml" className="transition-colors hover:text-muted">
              Sitemap
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="eyebrow mb-4 border-b border-ink-line pb-3">{title}</p>
      <ul className="space-y-3 text-sm text-muted">
        {links.map((l) => (
          <li key={l.label}>
            {/* sitemap.xml is a generated route, not a page — a plain anchor
                avoids Next trying to client-navigate to it. */}
            {l.href.endsWith(".xml") ? (
              <a href={l.href} className="transition-colors hover:text-cloud">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="transition-colors hover:text-cloud">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

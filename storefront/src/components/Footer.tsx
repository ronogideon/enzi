import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-line bg-ink-800/40">
      <div className="shell grid gap-12 py-16 md:grid-cols-4">
        <div className="md:col-span-1">
          <p className="font-display text-2xl font-extrabold tracking-tight text-white">
            ENZI PACKAGING
          </p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Premium, sustainable packaging for e-commerce brands and businesses
            across Kenya.
          </p>
          <div className="mt-6 flex items-center gap-3 opacity-60">
            {["VISA", "MC", "PayPal", "Pay"].map((m) => (
              <span
                key={m}
                className="rounded border border-ink-line px-2 py-1 text-[10px] font-semibold text-muted"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        <FooterCol
          title="Quick links"
          links={[
            { label: "About Us", href: "/contact" },
            { label: "News & Blogs", href: "/blog" },
            { label: "Reviews & Ratings", href: "/reviews" },
            { label: "FAQs", href: "/faqs" },
            { label: "Contact Us", href: "/contact" },
          ]}
        />
        <FooterCol
          title="Important links"
          links={[
            { label: "Privacy Policy", href: "/contact" },
            { label: "Refund Policy", href: "/contact" },
            { label: "Terms & Conditions", href: "/contact" },
            { label: "Cookies Policy", href: "/contact" },
          ]}
        />

        <div>
          <p className="eyebrow mb-4 border-b border-ink-line pb-3">Follow us</p>
          <p className="text-sm text-muted">Stay connected on social media.</p>
          <div className="mt-4 flex gap-3">
            {["Instagram", "TikTok", "WhatsApp"].map((s) => (
              <span
                key={s}
                className="grid h-10 w-10 place-items-center rounded-full border border-ink-line text-xs text-muted"
                title={s}
              >
                {s[0]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-ink-line">
        <div className="shell flex flex-col items-center justify-between gap-2 py-5 text-xs text-faint sm:flex-row">
          <p>© {new Date().getFullYear()} Enzi Packaging Solutions. All rights reserved.</p>
          <p>
            <Link href="/contact" className="hover:text-muted">
              Privacy Policy
            </Link>{" "}
            |{" "}
            <Link href="/contact" className="hover:text-muted">
              Terms of Service
            </Link>
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
            <Link href={l.href} className="hover:text-cloud">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

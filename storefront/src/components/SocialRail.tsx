"use client";

import { Icon } from "@/components/Icons";
import type { SiteConfig } from "@/lib/api";

type Socials = SiteConfig["socials"];

/**
 * The social rail and chat button.
 *
 * Links come from the admin (Settings → Social links) rather than being
 * hardcoded, and a blank setting hides that icon entirely — better than
 * shipping a link to a profile the shop doesn't actually run. Each uses its own
 * brand mark instead of the two-letter text placeholders that were here before.
 */
const ORDER: {
  key: keyof Socials;
  label: string;
  icon: keyof typeof Icon;
  href: (v: string) => string;
}[] = [
  { key: "instagram", label: "Instagram", icon: "Instagram", href: absoluteUrl },
  { key: "facebook", label: "Facebook", icon: "Facebook", href: absoluteUrl },
  { key: "tiktok", label: "TikTok", icon: "TikTok", href: absoluteUrl },
  { key: "x", label: "X", icon: "X", href: absoluteUrl },
  { key: "linkedin", label: "LinkedIn", icon: "LinkedIn", href: absoluteUrl },
  { key: "youtube", label: "YouTube", icon: "YouTube", href: absoluteUrl },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "Whatsapp",
    // Stored as a bare number; turn it into a wa.me link.
    href: (v) => (/^https?:\/\//i.test(v) ? v : `https://wa.me/${v.replace(/[^0-9]/g, "")}`),
  },
];

/**
 * A value without a scheme ("instagram.com/enzi") is not an absolute URL, so
 * the browser resolves it against the current page and you land on
 * enzipackaging.com/instagram.com/enzi — a 404. Adding the scheme here means
 * the link works whether it's saved with https:// or without.
 */
function absoluteUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
}

function activeLinks(socials: Socials) {
  return ORDER.filter((s) => (socials[s.key] ?? "").trim().length > 0).map((s) => ({
    ...s,
    url: s.href((socials[s.key] ?? "").trim()),
  }));
}

export function SocialRail({ socials }: { socials: Socials }) {
  const links = activeLinks(socials);
  if (!links.length) return null;

  return (
    <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
      {links.map((s) => {
        const Glyph = Icon[s.icon];
        return (
          <a
            key={s.key}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
            className="grid h-10 w-10 place-items-center rounded-full border border-ink-line bg-ink-card text-muted transition-all duration-200 hover:scale-105 hover:bg-ink-hover hover:text-cloud"
          >
            <Glyph className="h-[18px] w-[18px]" />
          </a>
        );
      })}
    </div>
  );
}

/** Inline row of social icons, for the footer. */
export function SocialRow({ socials }: { socials: Socials }) {
  const links = activeLinks(socials);
  if (!links.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((s) => {
        const Glyph = Icon[s.icon];
        return (
          <a
            key={s.key}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
            className="grid h-9 w-9 place-items-center rounded-full border border-ink-line text-muted transition-colors hover:bg-ink-hover hover:text-cloud"
          >
            <Glyph className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}

export function ChatButton({ whatsapp }: { whatsapp?: string }) {
  const number = (whatsapp ?? "").replace(/[^0-9]/g, "");
  if (!number) return null;

  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-whatsapp shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-ink" fill="currentColor" aria-hidden>
        <path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3zm0 2a7 7 0 11-3.6 13l-.3-.2-2.1.6.6-2-.2-.3A7 7 0 0112 5z" />
        <path d="M9.5 8.4c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.3.5.7 1 1.3 1.4.5.3.7.3.9.2l.5-.4c.2-.1.4-.1.5 0l1.3.7c.2.1.3.3.3.4 0 .5-.5 1-1 1.2-.4.2-1 .2-2-.2a8 8 0 01-3.6-3.1c-.5-.8-.6-1.5-.6-1.9 0-.5.3-.9.4-1z" />
      </svg>
    </a>
  );
}

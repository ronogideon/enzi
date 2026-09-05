/** Read at runtime from window.__ENV__ (browser) or process.env (server), so
 * the number is changeable from Railway without a rebuild. */
function whatsappNumber(): string {
  if (typeof window !== "undefined" && window.__ENV__?.WHATSAPP)
    return window.__ENV__.WHATSAPP;
  return process.env.WHATSAPP ?? process.env.NEXT_PUBLIC_WHATSAPP ?? "254110050620";
}

export function SocialRail() {
  const items = [
    { label: "Instagram", href: "https://instagram.com", glyph: "IG" },
    { label: "TikTok", href: "https://tiktok.com", glyph: "TT" },
    { label: "WhatsApp", href: `https://wa.me/${whatsappNumber()}`, glyph: "WA" },
  ];
  return (
    <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
      {items.map((i) => (
        <a
          key={i.label}
          href={i.href}
          target="_blank"
          rel="noopener noreferrer"
          title={i.label}
          className="grid h-10 w-10 place-items-center rounded-full border border-ink-line bg-ink-card text-xs text-muted transition-colors hover:bg-ink-hover hover:text-cloud"
        >
          {i.glyph}
        </a>
      ))}
    </div>
  );
}

export function ChatButton() {
  return (
    <a
      href={`https://wa.me/${whatsappNumber()}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-indigo shadow-lg transition-transform hover:scale-105"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-whatsapp" fill="currentColor">
        <path d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4.3A8 8 0 1120 12z" opacity="0" />
        <path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3zm0 2a7 7 0 11-3.6 13l-.3-.2-2.1.6.6-2-.2-.3A7 7 0 0112 5z" />
        <path d="M9.5 8.4c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.3.5.7 1 1.3 1.4.5.3.7.3.9.2l.5-.4c.2-.1.4-.1.5 0l1.3.7c.2.1.3.3.3.4 0 .5-.5 1-1 1.2-.4.2-1 .2-2-.2a8 8 0 01-3.6-3.1c-.5-.8-.6-1.5-.6-1.9 0-.5.3-.9.4-1z" />
      </svg>
    </a>
  );
}

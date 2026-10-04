import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { STEP_LABELS, statusMeta, stepState } from "./order-status";

/**
 * The live status card in every order email.
 *
 * Emails can't run code, so "live" means the image itself is drawn fresh each
 * time the email is opened. Gmail and Outlook don't render SVG, so it's
 * rasterised to PNG with resvg (a prebuilt native binary — no Chromium, no
 * canvas). Fonts ship in backend/assets/fonts because a Railway container has
 * no system fonts to fall back on.
 */
// src/modules/notifications and dist/modules/notifications are both three
// levels below the backend root, so this resolves in dev and in production.
const FONT_DIR = path.resolve(__dirname, "../../../assets/fonts");
const FONT_FILES = [path.join(FONT_DIR, "Inter-Regular.ttf"), path.join(FONT_DIR, "Inter-SemiBold.ttf")];

const C = {
  ink: "#111827",
  muted: "#6b7280",
  line: "#e5e7eb",
  ok: "#16a34a",
  warn: "#b45309",
  bad: "#dc2626",
  card: "#ffffff",
};

const when = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function statusSvg(status: string, updatedAt: Date): string {
  const m = statusMeta(status);
  const W = 600;
  const H = 170;
  const xs = [70, 223, 377, 530];
  const y = 112;
  const head = m.tone === "cancelled" ? C.bad : m.tone === "waiting" ? C.warn : C.ink;
  const p: string[] = [];

  for (let i = 0; i < xs.length - 1; i++) {
    const filled = stepState(m, i + 1) !== "todo";
    p.push(
      `<line x1="${xs[i] + 14}" y1="${y}" x2="${xs[i + 1] - 14}" y2="${y}" stroke="${filled ? C.ok : C.line}" stroke-width="3" stroke-linecap="round"/>`,
    );
  }

  xs.forEach((x, i) => {
    const s = stepState(m, i);
    if (s === "done") {
      p.push(`<circle cx="${x}" cy="${y}" r="11" fill="${C.ok}"/>`);
      p.push(
        `<path d="M${x - 5} ${y} l3.4 3.4 l6.6 -6.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    } else if (s === "current") {
      p.push(`<circle cx="${x}" cy="${y}" r="10" fill="${C.card}" stroke="${C.ok}" stroke-width="3"/>`);
      p.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${C.ok}"/>`);
    } else {
      p.push(`<circle cx="${x}" cy="${y}" r="10" fill="${C.card}" stroke="${C.line}" stroke-width="3"/>`);
    }
    p.push(
      `<text x="${x}" y="${y + 34}" text-anchor="middle" font-size="13" font-weight="${s === "current" ? 600 : 400}" fill="${s === "todo" ? C.muted : C.ink}">${STEP_LABELS[i]}</text>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${C.card}" stroke="${C.line}"/>
<text x="28" y="46" font-size="22" font-weight="600" fill="${head}">${esc(m.headline)}</text>
<text x="${W - 28}" y="44" text-anchor="end" font-size="12" fill="${C.muted}">Updated ${esc(when.format(updatedAt))}</text>
<text x="28" y="72" font-size="14" fill="${C.muted}">${esc(m.detail)}</text>
${p.join("\n")}
</svg>`;
}

const cache = new Map<string, Buffer>();

export function renderStatusPng(status: string, updatedAt: Date): Buffer {
  const key = `${status}|${Math.floor(updatedAt.getTime() / 60_000)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const png = new Resvg(statusSvg(status, updatedAt), {
    fitTo: { mode: "width", value: 1200 }, // 2x for retina
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();

  if (cache.size >= 500) cache.delete(cache.keys().next().value as string);
  cache.set(key, png);
  return png;
}

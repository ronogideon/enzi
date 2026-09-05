/**
 * A deliberately small Markdown renderer.
 *
 * Why not store HTML, or pull in a Markdown library?
 *
 *   - Storing HTML from an editor means anything a staff account pastes ends up
 *     in every visitor's browser. One compromised staff login would become a
 *     script injection on the shop.
 *   - This renders a fixed subset to a fixed set of tags. There is no path from
 *     stored text to arbitrary markup, because raw HTML in the source is
 *     escaped rather than passed through.
 *
 * Supported: headings (##, ###), bold, italic, inline code, links, images,
 * bullet and numbered lists, blockquotes, horizontal rules, paragraphs.
 * That covers everything a shop blog post needs.
 */

import { imageUrl } from "./api";

/** Escape first, always — everything below emits into that escaped string. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only http(s), mailto and tel links, plus our own /api/media paths.
 * Blocks `javascript:` and `data:` URLs, which are the classic way to smuggle
 * script through an href.
 */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^tel:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return null;
}

/** Inline formatting, applied to already-escaped text. */
function inline(text: string, resolveImage: (u: string) => string): string {
  let out = text;

  // Images before links — the syntax differs only by a leading "!".
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return "";
    return `<img src="${resolveImage(safe)}" alt="${alt}" loading="lazy" class="my-6 w-full rounded-xl border border-ink-line" />`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return label;
    const external = /^https?:\/\//i.test(safe);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${safe}"${attrs} class="text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white">${label}</a>`;
  });

  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 text-[0.9em]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return out;
}

export function renderMarkdown(
  source: string,
  // Uploaded images are stored as "/api/media/<id>", a path relative to the API
  // rather than the storefront, so they need resolving against the API host.
  resolveImage: (url: string) => string = imageUrl
): string {
  const lines = escapeHtml(source ?? "").split(/\r?\n/);
  const html: string[] = [];

  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeParagraph = () => {
    if (paragraph.length) {
      html.push(
        `<p class="mb-5 leading-relaxed text-muted">${inline(paragraph.join(" "), resolveImage)}</p>`
      );
      paragraph = [];
    }
  };
  const closeAll = () => {
    closeParagraph();
    closeList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      closeAll();
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      const size =
        level === 2 ? "text-2xl md:text-3xl" : level === 3 ? "text-xl" : "text-lg";
      html.push(
        `<h${level} class="display mb-4 mt-10 ${size}">${inline(heading[2], resolveImage)}</h${level}>`
      );
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      closeAll();
      html.push('<hr class="my-10 border-ink-line" />');
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeAll();
      html.push(
        `<blockquote class="my-6 border-l-2 border-white/30 pl-5 italic text-cloud">${inline(
          line.replace(/^>\s?/, ""),
          resolveImage
        )}</blockquote>`
      );
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      closeParagraph();
      if (listType !== "ul") {
        closeList();
        html.push('<ul class="mb-5 list-disc space-y-2 pl-6 text-muted">');
        listType = "ul";
      }
      html.push(`<li>${inline(bullet[1], resolveImage)}</li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      closeParagraph();
      if (listType !== "ol") {
        closeList();
        html.push('<ol class="mb-5 list-decimal space-y-2 pl-6 text-muted">');
        listType = "ol";
      }
      html.push(`<li>${inline(numbered[1], resolveImage)}</li>`);
      continue;
    }

    // A lone image on its own line shouldn't be wrapped in a paragraph.
    if (/^!\[[^\]]*\]\([^)\s]+\)$/.test(line.trim())) {
      closeAll();
      html.push(inline(line.trim(), resolveImage));
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  closeAll();
  return html.join("\n");
}

/** First ~160 characters of prose, for an auto-generated excerpt. */
export function excerptFrom(markdown: string, length = 160): string {
  const plain = (markdown ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= length) return plain;
  return plain.slice(0, plain.lastIndexOf(" ", length) || length).trim() + "…";
}

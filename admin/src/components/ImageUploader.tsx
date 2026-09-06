import { useRef, useState } from "react";
import { api, mediaUrl } from "@/lib/api";
import type { ProductImage } from "@/lib/types";

/**
 * Photos come off phones at 4–12 MB, which is far more resolution than a
 * product card ever renders. Downscaling in the browser before upload keeps
 * requests small (a 6 MB snap lands at roughly 250 KB), makes the shop faster
 * for customers on mobile data, and means the API never needs an image
 * processing library.
 */
const MAX_EDGE = 1400;
const QUALITY = 0.8;
/** Anything above this after the first pass gets re-encoded harder. */
const TARGET_BYTES = 300 * 1024;

export async function compressImage(file: File): Promise<{ data: string; width: number; height: number }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`${file.name} isn't a readable image`));
      el.src = bitmapUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser blocked image processing");
    ctx.drawImage(img, 0, 0, width, height);

    // WebP where the browser supports it — typically 25-35% smaller than JPEG
    // at the same visual quality, which matters because these bytes live in
    // Postgres. Falls back to JPEG automatically (toDataURL returns a PNG data
    // URL if the requested type isn't supported, so we detect and retry).
    const preferred = canvas.toDataURL("image/webp", QUALITY);
    let data = preferred.startsWith("data:image/webp")
      ? preferred
      : canvas.toDataURL("image/jpeg", QUALITY);

    /**
     * Second pass. A busy photograph can still land well over the target at
     * q0.8, so step the quality down until it fits. Stopping at 0.55 keeps it
     * visibly clean — below that, packaging photos start showing artefacts on
     * flat colour, which is exactly where this shop's products live.
     */
    const bytesOf = (url: string) => Math.ceil((url.length - url.indexOf(",") - 1) * 0.75);
    const type = data.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
    let q = QUALITY;
    while (bytesOf(data) > TARGET_BYTES && q > 0.55) {
      q -= 0.08;
      data = canvas.toDataURL(type, q);
    }

    return { data, width, height };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function ImageUploader({
  images,
  onChange,
  max = 8,
}: {
  images: ProductImage[];
  onChange: (next: ProductImage[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    const room = max - images.length;
    if (room <= 0) {
      setError(`You can have at most ${max} photos on a product.`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);

    setBusy(true);
    const added: ProductImage[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        const file = chosen[i];
        setProgress(`Uploading ${i + 1} of ${chosen.length}…`);
        if (!file.type.startsWith("image/")) {
          setError(`${file.name} isn't an image — skipped.`);
          continue;
        }
        const { data, width, height } = await compressImage(file);
        const uploaded = await api.uploadImage({
          filename: file.name,
          data,
          width,
          height,
        });
        added.push({ url: uploaded.url, mediaId: uploaded.id, alt: null });
      }
      if (added.length) onChange([...images, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function addUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setError("Paste a full link starting with http:// or https://");
      return;
    }
    if (images.length >= max) {
      setError(`You can have at most ${max} photos on a product.`);
      return;
    }
    onChange([...images, { url }]);
    setUrlDraft("");
    setError(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label mb-0">Photos</label>
        <span className="text-xs text-faint">
          {images.length}/{max} · first one is the main image
        </span>
      </div>

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <div key={`${img.url}-${i}`}>
            <div className="group relative aspect-square overflow-hidden rounded-xl border border-ink-line bg-ink-800">
              <img
                src={mediaUrl(img.url)}
                alt={img.alt ?? ""}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {i === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                  Main
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  className="px-1.5 text-xs text-white disabled:opacity-30"
                  aria-label="Move earlier"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-1.5 text-xs text-red-300 hover:text-red-200"
                  aria-label="Remove photo"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === images.length - 1}
                  className="px-1.5 text-xs text-white disabled:opacity-30"
                  aria-label="Move later"
                >
                  →
                </button>
              </div>
            </div>
              <input
                value={img.alt ?? ""}
                onChange={(e) => {
                  const next = [...images];
                  next[i] = { ...next[i], alt: e.target.value };
                  onChange(next);
                }}
                placeholder="Describe this photo"
                aria-label={`Alt text for photo ${i + 1}`}
                className="mt-1.5 w-full rounded-lg border border-ink-line bg-ink-800 px-2 py-1.5 text-[11px] text-cloud placeholder:text-faint focus:border-white/30 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <p className="mt-2 text-xs text-faint">
          Describe each photo in the box on it — e.g. "White polymailer bags stacked on a
          shelf". Search engines index this, and it's what visually impaired customers
          hear.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => inputRef.current?.click()}
          disabled={busy || images.length >= max}
        >
          {busy ? progress ?? "Uploading…" : images.length ? "Add more photos" : "Upload photos"}
        </button>
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">
          Or paste an image link
        </summary>
        <div className="mt-2 flex gap-2">
          <input
            className="field"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
          />
          <button type="button" className="btn-ghost shrink-0" onClick={addUrl}>
            Add
          </button>
        </div>
      </details>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <p className="mt-2 text-xs text-faint">
        JPEG, PNG or WebP. Large photos are resized automatically before upload.
      </p>
    </div>
  );
}

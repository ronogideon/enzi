import { useState } from "react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Icon } from "@/components/Icons";

/**
 * Colour variations as separate listings.
 *
 * Each colour becomes its own product — its own page, URL, photos and SEO —
 * while sharing a group id so the storefront can offer the colour switcher and
 * so wholesale quantities combine across them.
 *
 * Everything is copied from this listing except the images, which is the whole
 * point: the shop uploads the photos that actually show each colour. New
 * listings start hidden so a colour with no photos of its own never reaches the
 * shop by accident.
 */
export function ColourGroupPanel({
  product,
  colourName,
  onColourNameChange,
  onCreated,
}: {
  /** Null while creating — the listing has to exist before siblings can copy it. */
  product: Product | null;
  colourName: string;
  onColourNameChange: (v: string) => void;
  onCreated: () => void;
}) {
  const [colours, setColours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);

  const grouped = !!product?.groupId;
  // Colour variations copy this listing, so it has to be saved first.
  const canCreateSiblings = !!product;

  async function create() {
    const names = colours
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!names.length) return;

    setBusy(true);
    setError(null);
    try {
      // The listing you're editing becomes the first colour, so there's no
      // hidden parent product sitting in the catalogue that nobody can buy.
      const payload = [
        ...(colourName.trim() ? [{ name: colourName.trim() }] : []),
        ...names.map((name) => ({ name })),
      ];
      if (!product) return;
      const res = await api.createColourListings(product.id, payload);
      setResult(res.created);
      setColours("");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the colour listings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="label mb-0">Colours</p>
      <p className="mb-4 text-xs text-faint">
        Each colour becomes its own listing with its own photos and page. They stay linked,
        so the shop shows a colour switcher and wholesale still counts across them.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">This listing&apos;s colour</label>
          <input
            className="field"
            value={colourName}
            onChange={(e) => onColourNameChange(e.target.value)}
            placeholder="White"
          />
          <p className="mt-1 text-xs text-faint">
            Leave blank if this product has no colour variations.
          </p>
        </div>

        <div>
          <label className="label">Create listings for</label>
          <div className="flex gap-2">
            <input
              className="field"
              value={colours}
              onChange={(e) => setColours(e.target.value)}
              placeholder="Chocolate, Blue"
              disabled={!canCreateSiblings}
            />
            <button
              type="button"
              className="btn-ghost shrink-0 text-xs"
              onClick={create}
              disabled={busy || !colours.trim() || !canCreateSiblings}
            >
              {busy ? "…" : "Create"}
            </button>
          </div>
          <p className="mt-1 text-xs text-faint">
            {canCreateSiblings
              ? "Comma separated. Copies everything here except the photos."
              : "Save this product first, then reopen it to create its other colours."}
          </p>
        </div>
      </div>

      {grouped && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-whatsapp">
          <Icon.Check className="h-3.5 w-3.5" />
          This listing is part of a colour group.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {result && result.length > 0 && (
        <div className="mt-3 rounded-lg border border-whatsapp/30 bg-whatsapp/10 p-3">
          <p className="text-xs text-whatsapp">
            Created {result.length} listing{result.length === 1 ? "" : "s"}:{" "}
            {result.join(", ")}
          </p>
          <p className="mt-1 text-xs text-muted">
            They&apos;re hidden until you add photos and switch them on — find them in the
            product list.
          </p>
        </div>
      )}
      {result && result.length === 0 && (
        <p className="mt-2 text-xs text-muted">
          Those colours already have listings in this group.
        </p>
      )}
    </div>
  );
}

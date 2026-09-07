# Deploy checklist — Enzi v0.5.1

No schema change. Redeploy backend, admin and storefront.

---

## The save bug — why wholesale never reached checkout

The product form still **required a listing-level retail price**, even when
every size already had its own. So on a product like your Polymailer bags —
A4 at 35/29 and A3 at 45/38 — the Save button stayed disabled, nothing was
written, and checkout had no wholesale price to apply. The data looked complete
on screen because it was; it just never got saved.

Fixed both ends:

- **The price fields are now optional** once your sizes are priced. They're
  labelled "optional" and show what will be used ("From sizes: 35").
- **The listing price is derived from your cheapest size** — so the shop card
  can say "from Ksh 35" and anything without a size has a sensible fallback.
- **The backend keeps it in step**: whenever you save sizes, the listing's
  retail and wholesale prices are recalculated from them, so they can't drift
  apart months later.

**After deploying, re-save each product that has sizes** (open it, hit Save).
That writes the prices properly and wholesale will start applying at checkout.

---

## The product list is less crowded

- **Edit, Duplicate and Delete are now icons** with hover tooltips, freeing the
  horizontal space those three words were taking.
- **Click a product name to expand it** — it reveals every size with its
  retail/wholesale price and its own stock count.
- **Retail and Wholesale show as a range** across sizes: `Ksh 35 – 45`.
- **Stock is the total across all sizes**, with a note of how many sizes are
  out.

All of it works on mobile too — tap the size count to expand.

---

## Worth checking

- [ ] Open a product with sizes → Save works **without** typing a listing price.
- [ ] Re-save your Polymailer listings, then check the wholesale price applies
      at checkout once you cross 100 of one size.
- [ ] Product list shows `Ksh 35 – 45` and the combined stock.
- [ ] Click a product name → sizes expand with per-size stock.

# Deploy checklist — Enzi v0.6.1

No schema change. Redeploy the **admin** (backend and storefront are
version-only).

---

## The colour creator was hidden — my mistake

It was built, but I wrapped it in `{product && …}`, so it only rendered when
**editing** an existing product and never when creating one. That's why you
couldn't find it in the listing flow.

It now shows **always**, in every product form, right under the photos:

- **This listing's colour** — free text, optional. Leave it blank and the
  product simply has no colour variations, exactly like leaving sizes empty.
- **Create listings for** — comma-separated colours, which generates a sibling
  listing per colour.

One honest constraint: creating sibling listings copies *this* listing, so the
product has to exist first. On a brand-new product the colour name field works
immediately, and the create button explains it needs saving first. Save, reopen,
and create the colours. Editing an existing product works in one pass.

## Photos are squared without cropping

The shop's grids and galleries are square, so a portrait phone photo previously
got cropped at display time — and on a mailer shot vertically, the crop takes
the ends off, which is exactly the part showing the size.

Uploads are now **fitted inside a square and centred**, so the whole image is
kept. The padding samples the photo's own corners, so a white studio shot pads
white and a dark backdrop pads dark rather than banding. If the corners
disagree — a busy photo with no clear backdrop — it pads white instead of
inventing a muddy average.

Everything else is unchanged: still resized to 1400px, still WebP where
supported, still stepped down to around 300 KB.

Existing photos are untouched. Re-upload any you want squared.

---

## Worth checking

- [ ] **Add product** → the Colours panel is visible under the photos, with the
      create button explaining it needs saving first.
- [ ] Save, reopen, type "Chocolate, Blue" → two new listings appear, hidden,
      with the sizes and prices copied.
- [ ] Leave the colour blank on a different product → no colour switcher on the
      shop, exactly as before.
- [ ] Upload a tall photo → it arrives square with the full image visible and
      padding matched to its background.

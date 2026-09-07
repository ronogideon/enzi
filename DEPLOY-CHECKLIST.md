# Deploy checklist — Enzi v0.5.2

No schema change. Redeploy admin and storefront (backend is version-only).

---

## Product page now prices at the wholesale rate

Your screenshot showed 100 × A4 totalling Ksh 3,500 — the retail rate — while
the cart correctly charged Ksh 3,800 for 100 × A3 at its wholesale price. The
product page was multiplying by `retailPrice` regardless of quantity.

Now each size row prices at the rate it has earned:

- The row's price switches to the wholesale figure once its quantity reaches
  your minimum, with a small **wholesale** note under it.
- The running total uses those rates, and says **"wholesale price applied"**.

One honest limit: the page can only count what's on screen — this colour.
Wholesale also counts **across colours**, so a buyer taking 60 black and 60 pink
of the same size qualifies at the cart even though neither page alone shows it.
The page is therefore a floor, never an overstatement — it will never promise a
wholesale price the cart won't honour.

## Mobile overflow fixed

The cart row had the product name, variant, wholesale note and Remove all
competing in one horizontal row, which pushed the price and Remove off-screen.
The name now shares its line only with Remove; everything else stacks beneath.
Image and padding shrink on small screens, and the quantity control uses its
compact size.

Product-page size rows also wrap properly now — on a narrow phone the size name
takes its own line, with price and quantity below.

## Admin product list fits at 100%

- Narrower minimum width, tighter cell padding, slightly smaller type, shorter
  column headers (Badge / Feat. / Live).
- No more side-to-side scrolling at normal zoom on a standard laptop screen.

## Expanded sizes look like the listing

Clicking a product name now reveals its sizes as **rows in the same table**,
aligned to the same columns:

- No dividers, dimmed slightly so the parent still reads as the main row.
- **No toggles** — those stay on the listing they control.
- The price column shows **that size's own price**, not the range.
- Stock shows for that size.

---

## Worth checking

- [ ] Product page: type 100 into a size → the row price drops to wholesale and
      the total reflects it.
- [ ] Cart on a phone: nothing overflows; Remove and the price are both visible.
- [ ] Admin Products at 100% zoom: no horizontal scrolling.
- [ ] Click a product name: sizes appear as aligned rows with their own prices,
      no toggles.

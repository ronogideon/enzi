# Deploy checklist — Enzi v0.6.2

No schema change. Redeploy the **backend** and the **storefront** (the admin is
version-only).

The backend is not optional here: the storefront now needs each colour
sibling's own prices, and the API wasn't sending them.

---

## The counter emptied every time you changed colour

The state that holds the quantities was already written to cover every colour.
What emptied it was the colour switch itself: `pickColour` called
`router.replace('/product/<slug>')`, which is a real navigation — Next
re-renders the page's server component for the new slug and remounts the buy
panel, and a remounted component starts from nothing. So typing 10 into Black
and tapping Pink threw the 10 away, chip bubble and all.

Colour switching now updates the address bar with `history.replaceState`. Same
URL behaviour, no navigation, nothing unmounts. The selection stays.

## Add to cart takes everything, once

One selection is held for the whole colour group, and one tap adds all of it:

- Type quantities against Black's sizes, switch to Pink, type more there, tap
  once. Every line goes into the cart together.
- The button says what it will do — **Add 140 pcs to cart** — rather than
  leaving it to be guessed.
- The green bubble on each colour chip shows what is held against it, and the
  running total names the part that is sitting in a colour you can't see.
- Stickers and anything else without sizes work the same way now. Previously
  that panel kept its own private quantity and only ever added the colour on
  screen.

The selection survives a reload or a trip to the cart and back — it's kept in
`sessionStorage` per colour group, cleared once added, and anything that has
sold out in the meantime is dropped rather than restored.

## Prices on the page now match what the cart charges

Three things were quietly wrong, and all three could show a customer one number
and charge another:

- **Sibling colours had no prices of their own.** The API sent a sibling's
  photos, sizes and stock but not its price, so a sizeless colour listing was
  priced from whichever colour's page you happened to be on. Fine while every
  colour costs the same, wrong the day one doesn't.
- **The wholesale tag counted one colour.** The cart qualifies wholesale across
  colours of the same size and price; the page counted only what was on screen,
  so it showed retail on an order the cart would have discounted. The page now
  groups exactly as the cart does.
- **The quantity boxes never re-read their value.** After adding to cart the
  fields still showed the old numbers while the real quantity was zero.

## Sold-out sizeless products showed an Add to cart button

`AddToCartPanel` tested `product.stockQty <= 0`, but the public API strips stock
counts, so the test read `undefined <= 0` — always false. It uses `inStock` now,
which is the field the API actually sends.

---

## Worth checking

- [ ] A product with colours **and** sizes: put 10 against a size in Black,
      switch to Pink, put 10 against a size there. Black's chip still shows 10,
      the total reads 20 pcs, the button says **Add 20 pcs to cart**.
- [ ] Tap it once → both lines land in the cart, the fields go back to 0, and
      the chip bubbles clear.
- [ ] Reach a wholesale threshold across two colours (60 + 40 of one size) →
      both rows show "wholesale", and the cart total agrees with the page.
- [ ] A sticker (colours, no sizes): set 2 on Gold, switch to Black, set 2 →
      the button offers 4 pcs and the cart gets both colours.
- [ ] Switch colours a few times and check the URL follows, then reload → the
      page opens on that colour with the selection intact.
- [ ] Open a colour that is sold out → still not selectable; a sold-out sizeless
      product now shows **Out of stock** instead of an active button.

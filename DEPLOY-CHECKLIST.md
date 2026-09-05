# Deploy checklist — Enzi v0.5.0

No new Railway variables. The schema is unchanged, so no `db:push` needed
either — just redeploy all three services.

---

## 1. Redeploy backend, storefront, admin

The pricing change lives in the backend, so deploy it first (or together).
Nothing else to configure.

## 2. Check the toggle

Admin → Products. The white knob should now sit **inside** the green pill and
slide to the left end when off. It was escaping the track because it had no
horizontal anchor and fell back to the button's centred text position.

## 3. Check wholesale on a product

Open any product with a wholesale price set:

- Below the threshold: retail price, and a line reading
  **"Wholesale minimum: ## pcs — save Ksh X each"**.
- Raise the quantity past it: the price changes in place, the line turns green
  and reads **"applied"**, and a toast fires with confetti —
  **"Wholesale discount applied"**, 2 seconds.
- The cart then shows total wholesale savings.

There is no tier selector anywhere any more. It's gone from the cart and from
checkout, because the quantity decides it.

If a product has no wholesale price, none of this shows. Set one in
**Products → Edit → Wholesale price** and **Wholesale minimum quantity**.

## 4. Check the admin on your phone

Open `dashboard.enzipackaging.com` (or the Railway URL) on a phone:

- Hamburger top-left opens a slide-in drawer with every section.
- Bottom bar has Home / Orders / Products / Stock.
- Products, Orders, Staff and Customers are cards, not tables.
- Tapping "Add product" opens a bottom sheet you can scroll.

## 5. Check the product page on desktop

The photo is now height-capped at 58vh, so the price and the add-to-cart button
sit above the fold instead of below a full-width square. Thumbnails scroll
horizontally under it and switch the main image; arrow keys work too.

---

## What to look at while you're in there

- [ ] Set a **wholesale price and minimum** on your real products — the whole
      feature is invisible until those two fields are filled in.
- [ ] **Settings → Payments** — confirm the callback URL is
      `https://api.enzipackaging.com/api/payments/mpesa/callback` and hit
      **Test M-Pesa connection**.
- [ ] Place one test order end to end, crossing the wholesale threshold, and
      confirm the order total in the admin matches what the shop quoted.

---

## A note on the animations

Everything added is an entrance or a press response, all under 300ms, and all
of it collapses to a plain fade under `prefers-reduced-motion`. Nothing loops,
nothing blocks a tap, and no animation sits between you and an action. If any
of it feels like too much on your hardware, the whole layer is in
`storefront/src/app/globals.css` under the "Motion" heading and can be tuned in
one place.

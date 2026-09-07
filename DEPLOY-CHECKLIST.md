# Deploy checklist — Enzi v0.5.0 — Product variations

**Schema change.** Run `npm run db:push` after deploying the backend.
Existing products are untouched — you add variations only where you want them.

---

## Deploy

1. **Backend** — redeploy, then `npm run db:push`
2. **Admin** — redeploy
3. **Storefront** — redeploy

---

## How variations work now

**Colours are separate listings; sizes live inside each listing.**

- Each colour gets its **own product page, own URL, own photos, own SEO** —
  what you asked for.
- They share a hidden group id, so the shop shows a **colour switcher** and the
  backend knows they're related.
- **Sizes** are set per listing, and **price is set once per size** — every
  colour of that size sells for the same amount, so you never retype it.
- **Stock is per size, per colour listing**, so a sold-out combination
  disappears on its own.

### Setting it up

1. Create the product as normal, add its photos.
2. In **Sizes & pricing**, add each size with its retail price, wholesale price
   and stock.
3. In **Colours**, name this listing's colour ("White") and type the others
   ("Chocolate, Blue") → **Create**.
4. Each new colour is created as its own listing with everything copied
   **except the photos**, and starts **hidden**.
5. Open each new listing, upload that colour's photos, set its stock, switch it
   on.

Running **Create** again later only adds colours that don't exist yet.

---

## Wholesale

Unchanged in rule, but now working across the separate listings:

> Quantities combine **across colours within a size**, never across sizes.

- 25 each of 4 colours in 8×10cm = 100 → wholesale ✓
- 50 of 8×10 + 50 of 10×15 = two runs of 50 → neither qualifies ✓

### On wholesale not applying

The cart now **tells you where it stands** on every line: either
**"Wholesale price applied"**, or **"N more of this size for the wholesale
price"**. The product page says the same as you type quantities.

If it isn't applying, that message will show you why. The usual cause is a
**blank wholesale price** on the size, or a **wholesale minimum** that hasn't
been reached — both now visible rather than silent. Check:

- **Sizes & pricing** → is the Wholesale column filled for that size?
- **Wholesale minimum quantity** on the product → what is it set to?

---

## Worth checking

- [ ] Existing products without variations behave exactly as before.
- [ ] Add two sizes with different prices; create two extra colours.
- [ ] New colour listings appear hidden, with the sizes and prices copied and
      no photos.
- [ ] On the shop: the colour chips switch the photos and the URL.
- [ ] Set one colour's size stock to 0 → that chip shows sold out.
- [ ] Put 50 of one size and 50 of another with a minimum of 100 → retail, and
      the cart says how many more are needed. Then 25 × 4 colours of one size →
      wholesale applies.

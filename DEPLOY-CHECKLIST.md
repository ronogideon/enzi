# Deploy checklist — Enzi v0.5.0 — Product variations

**Schema change.** Run `npm run db:push` after deploying the backend.

Existing products are untouched and keep working exactly as they do now — you
add variants only where you want them.

---

## Deploy

1. **Backend** — redeploy, then `npm run db:push`
   (adds `ProductVariant`, plus variant fields on products, images and order lines).
2. **Admin** — redeploy.
3. **Storefront** — redeploy.

---

## Adding options to a product

**Admin → Products → Edit → Options** (below the photos).

- **Add option** for one row at a time, or **Generate** when every colour comes
  in the same sizes — type `White, Chocolate, Blue` and `8*10cm, 10*15cm` and it
  creates the combinations. It only fills gaps, so running it again after adding
  a colour is safe.
- Each row has its **own price, own wholesale price and own stock**.
- The toggle takes an option off sale without deleting it.
- A product's own stock field is ignored once options exist — stock is tracked
  per option.

Removing an option that appears on past orders deactivates it rather than
deleting, so order history stays intact.

---

## What customers see

Colour chips first, then **only the sizes that exist for that colour** — so
White can have three sizes while Chocolate has two. Each size row shows its own
price and its own quantity box, so one visit can order 25 of 8×10 and 40 of
10×15 and add both together.

- Quantities are **typed, not just tapped** — with your minimum enforced on each
  option, not spread across the order.
- A sold-out colour or size is visibly unavailable and can't be added.
- Picking a colour **switches the gallery** to that colour's photos, if you've
  tagged photos to it. Untagged photos still show, so nothing breaks before you
  do that.

### Wholesale grouping

Exactly as you described: **quantities combine across colours within a size, but
never across sizes.**

- 25 each of 4 colours in 8×10cm = 100 → wholesale ✓
- 50 of 8×10 and 50 of 10×15 = two runs of 50 → neither qualifies ✓

---

## Stock display

The storefront now only ever says **in stock** or **out of stock** — exact
numbers never leave the API, so nobody can read your inventory.

The urgency line is yours to write: **Admin → Products**, the **Urgency badge**
column on each row. Toggle it on and type the text ("Few pieces remaining",
"Selling fast"). It appears on both the shop listing and the product page.

A genuinely sold-out product shows **out of stock** regardless of the badge.

---

## Worth checking

- [ ] An existing product without options still works exactly as before.
- [ ] Add two colours × two sizes to one product; set different prices per size.
- [ ] On the shop: pick a colour → only its sizes show; type 25 into one size
      and 40 into another → both add to the cart as separate lines.
- [ ] Set one option's stock to 0 → it shows unavailable and can't be added.
- [ ] Set a wholesale minimum of 100 and buy 50 + 50 across two sizes → retail
      price. Then 25 × 4 colours of one size → wholesale price.
- [ ] Turn on an urgency badge → it appears on the listing card and the product
      page.

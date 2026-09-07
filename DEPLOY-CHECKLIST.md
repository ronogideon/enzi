# Deploy checklist — Enzi v0.5.3

No schema change. Redeploy admin and storefront.

---

## Quantities now survive a colour switch

This was the important one. Switching colour remounted the selector and wiped
whatever had been typed — punishing exactly the shopper your pricing rewards,
since wholesale is earned *across* colours.

Now:

- Quantities are held for **every colour at once**. Put 60 into Black, switch to
  Pink, add 60 more, and add them all in one go.
- Each colour chip carries a **green bubble** showing how many pieces are
  pending against it, so nothing looks lost when you switch.
- **Add to cart** stays enabled while any colour has a selection, and adds the
  whole lot together.
- The running total counts **across colours and by size**, so 60 Black + 60 Pink
  of one size correctly reaches a 100 threshold and prices at wholesale on the
  page — matching what the cart will charge.

## Size rows use the width

Size, price and the quantity stepper now sit on **one line** at every screen
size, and the rows are shorter. On a phone the size name was taking a line of
its own with the price and stepper beneath, wasting the full width.

## Admin: nothing cut off at 100%

The sidebar is now a **narrow rail of icons** that expands to the full menu when
your pointer approaches it. It's an overlay with a fixed-width spacer, so
expanding never shifts the page — the product table keeps every pixel, gaining
about 11rem. That's the difference between fitting at 100% zoom and not.

## Dividers around expanded sizes

- The full horizontal rule now closes the **whole listing**, after its sizes.
- Sizes are separated by **faint** lines between themselves.
- A collapsed listing keeps its divider exactly as before.

---

## Worth checking

- [ ] Product page: enter 50 in Black, switch to Pink → the Black chip shows a
      "50" bubble and the numbers are still there when you switch back.
- [ ] Enter 60 Black + 60 Pink of the same size with a 100 minimum → the total
      shows the wholesale rate, and the cart agrees.
- [ ] Phone: size, price and stepper on one line.
- [ ] Admin at 100% zoom: full table visible; sidebar expands on hover.
- [ ] Expand a listing: faint lines between sizes, solid rule under the last one.

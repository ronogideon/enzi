# Deploy checklist — Enzi v0.3.1

No schema change. Redeploy all three.

---

## The retry-payment bug is fixed

You spotted it exactly: checkout confirmed, retry didn't. Here's why.

The checkout screen polls the **status endpoint**, and that endpoint asks Kopo
Kopo directly for the outcome — which is what actually confirms the payment when
the webhook doesn't arrive. The account page's retry button fired the STK prompt
but then only reloaded the order *list*; it never hit the status endpoint, so
the direct gateway query never ran, so a successful retry sat unconfirmed.

Now the retry button polls the same status endpoint the checkout screen uses.
A retried payment confirms the moment the gateway reports success — webhook or
no webhook — just like the first attempt.

---

## Order status is now a visual journey

Redesigned to match the style you shared:

- A **progress track** with five milestones — Ordered → Paid → Packed →
  Shipped → Delivered — each a node that fills green as the order reaches it,
  with the date beneath. (Store-pickup orders read "Ready" instead of
  "Shipped".)
- A cancelled or refunded order shows that state instead of the track.
- On the **right**: the **Retry Payment** button (for unpaid orders) and, below
  it, a **Download receipt** button with a download icon (for paid ones).
- "See order details" underneath.

The **Download receipt** opens a clean, printable receipt — itemised, with your
totals, delivery area and M-PESA reference — and a Download / Print button that
saves to PDF on any browser or phone. No PDF library on the server; the browser
does it.

---

## Deploy

Backend, admin, storefront. No `db:push`, no new variables.

---

## Worth checking

- [ ] An order that needs payment shows the journey with only "Ordered" filled,
      a **Retry Payment** button on the right.
- [ ] Tap **Retry Payment**, pay on your phone → within a few seconds the order
      flips to Paid, the "Paid" node fills, and **Download receipt** appears.
      **This is the fix — confirm it now works from the account page.**
- [ ] Tap **Download receipt** on a paid order → a printable receipt opens; the
      Download/Print button saves it as PDF.
- [ ] A delivered order shows all five nodes filled with their dates.

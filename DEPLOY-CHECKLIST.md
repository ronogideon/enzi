# Deploy checklist — Enzi v0.2.5

Schema change (order idempotency key). Run `npm run db:push`.

---

## FIRST — fix the callback URL. This is why nothing updates.

You set it to:

```
https://enzipackaging.com/api/payments/kopokopo/callback     ← WRONG
```

That's your **storefront**. It has no `/api` routes, so Kopo Kopo posts the
payment confirmation there, gets a 404, and the order is never marked paid. The
payment succeeds on the customer's phone but your system never hears about it.

It must point at the **backend**:

```
https://api.enzipackaging.com/api/payments/kopokopo/callback  ← CORRECT
```

Change it in **two places** and they must match:

1. **Admin → Settings → Payments → Kopo Kopo → Callback URL**
2. Your **Kopo Kopo dashboard** webhook settings

Until both say `api.enzipackaging.com`, confirmations can't arrive.

> Even with the URL fixed, this release adds a safety net: the customer's
> checkout now also asks the gateway directly whether payment went through, so
> a status resolves even if a webhook is delayed. But fix the URL — the direct
> query is a backstop, not a substitute, and Kopo Kopo relies on the webhook.

---

## Deploy

1. **Backend** — redeploy, then `npm run db:push` (adds the idempotency key).
2. **Admin** — redeploy.
3. **Storefront** — redeploy.

---

## What's fixed

### Payment status now shows immediately, with a reason

The checkout waiting screen resolves to one of:

- **Paid** → straight to the receipt.
- **Cancelled** — you cancelled the prompt.
- **Prompt timed out** — not answered in time.
- **Wrong PIN.**
- **Insufficient balance.**

Each is its own screen with a **Try again** button. No more staring at a spinner
that never resolves.

The admin order view now **auto-refreshes** — an unpaid order polls every few
seconds, so "paid" appears the moment the callback lands, and the orders list
refreshes every 20 seconds so payments and packing by colleagues show up without
a manual reload.

### Refreshing no longer creates duplicate orders

Each checkout attempt carries a stable key (kept across a refresh). If the same
checkout is submitted again — a page reload, a back-then-forward, a
double-tapped Pay button — the backend returns the **same** order instead of
creating a new one. Your order count, revenue, and packing queue stop being
inflated by refreshes.

---

## Worth checking

- [ ] Callback URL reads `api.enzipackaging.com` in **both** the admin and the
      Kopo Kopo dashboard.
- [ ] Make a live STK request and pay — the customer screen should flip to the
      receipt, and the admin order should show **paid** within a few seconds,
      no refresh.
- [ ] Cancel a prompt on your phone — the customer screen should say
      "Payment cancelled", not hang.
- [ ] On the STK screen, refresh the page mid-payment — confirm no second order
      appears in the admin.

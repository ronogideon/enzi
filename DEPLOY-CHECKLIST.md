# Deploy checklist — Enzi v0.2.7

No schema change. Redeploy all three.

---

## The "Order already paid" bug is fixed

The cause: the idempotency key was stored under one fixed browser key and only
cleared on some paths. After any completed order it lingered, so every later
checkout reused it, matched the old paid order, and showed "Order already paid".
A new account didn't help — the key lived in the browser, not the account.

Since we now redirect the customer away from checkout on **every** outcome, that
guard was solving a problem that no longer exists, so it's **gone entirely**. You
can add a new order and check out again immediately, no redirect, no stale block.

---

## The new payment flow

Exactly as you asked:

1. Customer fills the checkout and taps **Complete order / Pay**.
2. The M-Pesa (or Kopo Kopo) prompt goes to their phone. The screen shows
   "Check your phone — waiting for confirmation".
3. **Whatever happens** — paid, cancelled, wrong PIN, timeout, or no response —
   they're taken to their **account page**.
4. On the account page, each order shows its **status**. An order that still
   needs paying shows the reason ("The last payment didn't go through", or the
   specific message) and a **Pay now / Retry** button.
5. **Retry has a 40-second cooldown** — after sending a prompt the button reads
   "Retry in 40s… 39s…" and only re-enables at zero, so a customer can't fire
   several overlapping STK prompts and double-pay.

The account page **auto-refreshes** while any order is awaiting payment, so a
confirmation that lands a few seconds later flips the status to **Paid** on its
own — no manual reload.

Retry uses the same gateway selection as checkout (one shared code path), so
whichever of M-Pesa / Kopo Kopo is live is what the retry fires.

---

## Redeploy

Backend, admin, storefront. No Railway variables, no `db:push`.

---

## Worth checking

- [ ] Complete an order and pay — you land on your account page with the order
      showing **Paid** (within a few seconds if the confirmation is slightly
      delayed).
- [ ] Complete an order and **cancel** the prompt — you still land on the
      account page, the order shows **Awaiting payment**, and a **Retry** button
      is there.
- [ ] Tap Retry — a new prompt arrives, and the button counts down from 40س
      before it can be tapped again.
- [ ] Immediately start another order — no "Order already paid", no redirect;
      checkout works normally.

---

## Still open: Kopo Kopo confirmation (from v0.2.6)

This release is about the checkout/redirect flow. The Kopo Kopo callback
diagnostics from v0.2.6 still apply — if live payments aren't auto-confirming,
use **Settings → Payments → Callback activity → Check** and the backend
`[kopokopo]` logs to see whether the callback is arriving, and send me those.
The retry button and the admin's **Record payment received** both give you a way
through in the meantime.

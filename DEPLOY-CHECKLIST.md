# Deploy checklist — Enzi v0.3.0

Schema change (`Payment.statusUrl`). Run `npm run db:push`.

This release rebuilds the Kopo Kopo integration against their **official Node.js
SDK** — not from memory this time. The audit found the bug.

---

## What was actually wrong

I checked our code against Kopo Kopo's own SDK source. Two real bugs, either of
which alone stops every payment confirming:

1. **Signature verification.** Kopo Kopo signs `JSON.stringify(body)` — the
   re-serialised JSON — but our code hashed the **raw request bytes**. So the
   digest never matched, every callback was rejected with a 401, and no order
   was ever marked paid. **This is the one that was breaking you.**

2. **Status field.** The confirming value is `data.attributes.status ===
   "Success"` (capital S). Our code lowercased it and read a different, nested
   field (`resource.status`, which is `"Received"`). So even a callback that got
   past the signature wouldn't have been read as success.

Both are now fixed and verified against the SDK's own test fixtures.

Also corrected to match the SDK exactly: the OAuth token request is now
form-encoded, and the STK request sends the headers the SDK sends.

---

## The real fix: we no longer depend on the webhook

You asked how to check whether Kopo Kopo actually reports to us. The SDK exposes
a **status query** — you GET the payment's resource URL and Kopo Kopo tells you
the outcome directly. We now use it in three places:

- **The customer's checkout screen** queries it while waiting, so a payment
  resolves (paid / cancelled / failed) even if no webhook ever arrives.
- **The callback** uses it to re-confirm any webhook whose signature doesn't
  verify, instead of trusting or dropping it.
- **The admin** has a new **Check payment with gateway** button on each unpaid
  order — the definitive "did K2 get it?" check, on demand.

So even in the worst case where Kopo Kopo's webhook never reaches you, payments
still confirm — the shop asks, rather than waiting to be told.

---

## Timers, as requested

- **Checkout waiting screen:** a visible **25-second countdown**. A cancel,
  wrong PIN, or success redirects **immediately** (via the direct status query);
  otherwise at 0s it goes to the account page, where the order waits with a
  retry button.
- **Orders page:** the retry button is labelled **Retry Payment** and shows a
  **40-second countdown** ("Retry Payment in 39s…") before it can be tapped
  again, so no overlapping prompts.

---

## Deploy

1. **Backend** — redeploy, then `npm run db:push` (adds `Payment.statusUrl`).
2. **Admin** — redeploy.
3. **Storefront** — redeploy.

---

## Test it (this should finally work)

1. Confirm the callback URL is `https://api.enzipackaging.com/api/payments/kopokopo/callback`
   in **both** the admin and your Kopo Kopo dashboard.
2. Make a live payment and **pay** it → the checkout screen should flip to your
   account with the order **Paid** within a few seconds.
3. Make one and **cancel** the prompt → it should redirect to your account
   showing the order still needs payment, with **Retry Payment**. It should NOT
   load forever.
4. If an order ever sticks on pending, open it in the admin and hit **Check
   payment with gateway** — it asks Kopo Kopo directly and updates on the spot.

---

## If it STILL doesn't confirm

Then the callback genuinely isn't reaching your backend (a domain/routing issue,
not code), but the **direct status query now covers you regardless** — the
customer screen and the admin's Check button both confirm without the webhook.
Send me the `[kopokopo]` backend logs from a test payment and what
**Settings → Payments → Callback activity** shows, and we'll chase the routing.

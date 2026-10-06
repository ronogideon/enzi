# Deploy checklist — Enzi v0.7.1

**Schema change (additive)**: one new table, `PushSubscription`. Deploy the
backend, run `npm run db:push` in its Railway shell, then deploy the storefront
and admin. (If v0.7.0's push was never run, this one covers both.)

**No new Railway variables.** Push keys are generated on first use and stored
in Settings, encrypted like the M-Pesa keys.

---

## Search bar on phones
A search box now sits under the header on phones. It slides away while you
scroll down and comes back the moment you scroll up — and stays put while
someone is typing. On /shop it's prefilled with the current search. Tablets and
desktop keep the search in the header as before.

## Shop filters on phones
Categories and Price are dropdowns on small screens, with Sort beside Price, so
products start near the top instead of below two long lists. Desktop unchanged.

## Staff email for every new order
- Goes to every **active** SuperAdmin, Admin and Staff member (the roles that
  can open Orders). Support doesn't get them.
- Fires with the customer confirmation: when a pay-on-delivery order is placed,
  or when a pay-first order's payment lands. Unpaid attempts alert no one.
- Shows customer, tap-to-call phone, payment, delivery and items, with
  **Open in admin** going straight to that order.

## Order alerts on staff phones (installable admin)
The admin is now an installable app with push notifications.

**Android (Chrome):**
1. Open the admin in Chrome and sign in.
2. Tap **Install app** on the banner (or Chrome menu → *Install app*).
3. Tap **Turn on alerts** → Allow.
4. Menu → *Order alerts* → **Send test**.

**iPhone (iOS 16.4+):** Safari → Share → *Add to Home Screen*, open Enzi Admin
from the home screen, then turn alerts on. Safari tabs can't receive them.

How it behaves:
- Same roles and same moment as the staff email. Each alert shows the order
  number, total, customer, item count and payment, and **stays on screen until
  tapped** (Android). Tapping opens that order.
- Works with the app closed. Alerts older than an hour are dropped rather than
  delivered late.
- On by device: each phone or computer is turned on separately.
- **Sign out** turns alerts off on that device (it may be handed to someone
  else). Being signed out for inactivity does not — the phone keeps ringing.
- Deactivated staff stop receiving alerts immediately. Uninstalled apps are
  cleaned up automatically.
- Android may delay alerts for apps with aggressive battery saving. If a phone
  is slow to ring: Settings → Apps → Chrome → Battery → *Unrestricted*.

### Check
- [ ] Phone, storefront: search bar under the header; scroll down → it hides;
      scroll up a little → it's back. Search "box" → /shop?search=box.
- [ ] Phone: /shop shows the three dropdowns with products right below.
- [ ] Place a POD order → staff get the "New order" email.
- [ ] Android: install admin, turn alerts on, **Send test** → notification.
- [ ] Close the app, place an order → notification arrives; tap → order opens.
- [ ] Sign out on that phone, place an order → no notification there.

---

# v0.7.0

**Schema change (additive).** Redeploy all three services, then run
`npm run db:push` in the backend's Railway shell. Every new column is nullable
and the new table is empty, so nothing existing is touched.

Order matters: deploy the backend and run `db:push` before the frontends go
out. Until the schema is pushed, signed-in requests answer with a "database is
missing a column" error.

---

## 1. Resend (do this first)

1. Resend → Domains → add `enzipackaging.com`, then add the DNS records it
   gives you (DKIM, SPF, and the MX on the `send` subdomain).
2. Add a DMARC record if you don't have one: `TXT _dmarc` → `v=DMARC1; p=none;`
   Gmail sends mail from unauthenticated domains to spam.
3. Resend → API Keys → create a key with **sending access** only.

## 2. Railway variables — backend only

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_…` (required) |
| `PUBLIC_API_URL` | `https://api.enzipackaging.com` |
| `STOREFRONT_URL` | `https://enzipackaging.com` |
| `ADMIN_URL` | `https://dashboard.enzipackaging.com` — or the admin's Railway domain until the subdomain is live |

Optional: `EMAIL_FROM_ORDERS`, `EMAIL_FROM_ACCOUNT`, `EMAIL_REPLY_TO` (falls
back to Settings → Store email), `TRACKING_SECRET` (derived from `JWT_SECRET`
if unset).

The storefront and admin need nothing new. SMS uses the Talk Sasa settings you
already have.

The backend now declares `"engines": { "node": ">=20" }` — the Resend SDK needs
Node 20. Railway reads this from package.json.

---

## Order emails with a live status

- **Confirmation** goes out when a pay-on-delivery order is placed, or when a
  pay-first order's payment lands (M-Pesa, Kopo Kopo, or staff marking it paid).
- **Updates** go out on Dispatched, Delivered, Cancelled and Refunded. Processing
  and Packed only move the live status, to keep the inbox quiet. An order that
  never got past Awaiting payment gets no cancellation email — the customer was
  never told it existed.
- The status card in every email is an image drawn fresh by the API each time
  the email is opened, so a months-old email shows today's status. Tapping it
  opens `/track/<id>/<signature>` on the storefront.
- Customers without an email on file get nothing — email is optional at
  checkout. All sending is in the background; a Resend failure can never fail a
  checkout or a status change.

**Where it isn't live:** Apple Mail with Mail Privacy Protection downloads
images once when the email arrives, so those customers see the status as it was
then. Desktop Outlook blocks images until allowed. Both still get the "Track
your order" button.

## Forgotten password — staff and customers

- Storefront: **Sign in → Forgot password?** (`/account/reset-password`).
  Admin: **Login → Forgot password?** (`/reset-password`).
- One request sends a 30-minute link by email and a 10-minute 6-digit code by
  SMS — whichever the account has. Either one works.
- The response is identical whether or not the account exists. Each link or code
  works once; a code locks after 5 wrong tries; 3 requests per account per
  15 minutes; 10 per IP.
- A completed reset signs the account out of every other session and sends a
  "password changed" email and SMS.
- Staff SMS only works if the staff member has a phone number on the Staff page.

## Sessions now end when they should

- Resetting a password ends every older session (staff and customers).
- An admin resetting another staff member's password signs that person out.
- **Deactivating a staff member now signs them out within 30 seconds.**
  Previously they stayed in until their 8-hour token ran out.

## Fixed: paying a pay-on-delivery order early

Marking a POD order paid while it was already Packed or Dispatched threw it back
to Confirmed, and counted it a second time in the customer's order count and
total spent. It now keeps its status and is counted once.

---

## Worth checking

- [ ] Place a POD order with an email → confirmation arrives; the status card
      reads "Order confirmed".
- [ ] Move it to Packed in the admin, reopen the same email → card shows Packed.
      No new email.
- [ ] Mark it Dispatched with a tracking ref → "on its way" email with the ref.
- [ ] Tap "Track your order" → storefront track page matches. Change one
      character of the URL → 404.
- [ ] Place an M-Pesa order, pay → confirmation arrives only after payment.
- [ ] Storefront: Forgot password with a phone → SMS code arrives, reset works,
      the old session on another browser is signed out on its next request.
- [ ] Admin: Forgot password with your staff email → link arrives, opens the
      admin reset page, new password works.
- [ ] Deactivate a test staff account while it's signed in → it's sent to the
      login screen within 30 seconds.
- [ ] Mark a Dispatched POD order paid → it stays Dispatched.

## Still open (not changed in this release)

- `GET /api/orders/number/:orderNumber` and its `/receipt` are public and keyed
  only on the sequential order number, so anyone can step through orders and
  read names, phone numbers and payment callback data. Worth locking to the
  signed tracking links or the signed-in customer.
- Checkout sends an `idempotencyKey`, but `POST /api/orders` doesn't accept it,
  so the duplicate-submit protection the schema was built for isn't active.

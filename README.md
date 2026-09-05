# Enzi Packaging — commerce platform

v0.4.0 · Node/Express/TypeScript/Prisma/Postgres, deployed on Railway.

| Service | Stack | Root Directory | Purpose |
|---|---|---|---|
| `backend/` | Express + TS + Prisma + Postgres | `backend` | One API for both frontends |
| `storefront/` | Next.js 14 (SSR) | `storefront` | Customer-facing shop |
| `admin/` | React + Vite (SPA) | `admin` | Staff/admin portal |

---

## Deploy this update

The schema changed, so push it before anything else.

```bash
# In the Railway shell for the BACKEND service:
npm run db:push        # adds MediaAsset, OrderEvent, and the new columns
```

`db:push` is additive here — every new column is nullable or has a default, so
existing products, orders and customers are untouched.

Then set **one variable on the admin service**, which is the thing that was
causing the login failure:

```
API_URL = https://<your-backend-service>.up.railway.app
```

Redeploy the admin. That's the whole fix. The deploy log will now print the
resolved URL, or a loud warning if it's still missing.

---

## Why the admin login was failing

`admin/src/lib/api.ts` resolved its API base like this:

```
window.__ENV__.API_URL  ||  VITE_API_URL  ||  "http://localhost:4000/api"
```

When `API_URL` isn't set, `gen-env.mjs` writes an **empty string**, which is
falsy in JavaScript. So the chain fell through to `localhost:4000` — meaning
your deployed admin was asking the browser to connect to your own laptop.
The browser can't, and reports `TypeError: Failed to fetch`. That error is
network-level; it never means "wrong password", which is why the credentials
looked broken when they weren't.

Four changes so this can't recur, and can't be silent if something related goes
wrong:

1. **Base URL resolution** (`admin/src/lib/api.ts`) no longer falls back to
   localhost unless the *page itself* is on localhost. It also normalises the
   URL — trailing slashes stripped, `/api` appended exactly once — so a missing
   or doubled suffix can't break it.
2. **`gen-env.mjs`** normalises the same way and prints a boxed warning in the
   deploy log when `API_URL` is unset.
3. **CORS** (`backend/src/app.ts`) was rewritten. With `CORS_ORIGINS` unset it
   reflects any origin (safe here: auth is a Bearer header, not a cookie, so
   there's no ambient-credential risk). It always allows localhost and
   `*.railway.app`, answers preflight explicitly, and denies by *omitting*
   headers rather than throwing — so a stray browser probe can't 500 the API.
4. **The login page is now a diagnostic.** It pings `/health` on mount, shows
   the exact URL it's using, and if that fails offers an inline field to set the
   API URL from the browser — enough to get in and fix the real config without a
   redeploy cycle. That override lives in `localStorage` only.

**Locked out entirely?** From the backend's Railway shell:

```bash
ADMIN_EMAIL=you@enzipackaging.co.ke ADMIN_PASSWORD='a-new-password' npm run reset-admin
```

Creates or resets the account, sets it SUPERADMIN, and marks it active.

---

## What's in this drop

### Staff accounts (`/staff`)
Create a login for each person in the shop. Four roles, with what each can do
spelled out in the UI:

| Role | Sees |
|---|---|
| **SUPERADMIN** (Owner) | Everything, including managing other admins |
| **ADMIN** (Manager) | Everything day-to-day: products, pricing, promos, payment keys, staff |
| **STAFF** (Shop floor) | Orders, packing, dispatch, products, stock. No payment keys, no marketing spend |
| **SUPPORT** (Customer care) | Orders and customer contact details |

New accounts get a readable temporary password (`kraft-4821`) shown once, with a
copy button, and are forced to set their own on first sign-in. Guards prevent
you deactivating yourself, changing your own role, or removing the last active
superadmin. Staff who have packed orders are **deactivated rather than deleted**,
so "packed by Jane" stays true after Jane leaves.

### Order fulfilment
The flow your shop floor walks:

```
CONFIRMED -> PROCESSING -> PACKED -> DISPATCHED -> DELIVERED
```

Filters are named the way the day is actually thought about — *To pack*, *To
ship*, *On the way* — with live counts. Each transition records **who** and
**when** into an append-only `OrderEvent` table, so the order page shows real
history rather than a status column someone might have flipped by accident.
Also: a tracking/parcel reference field (matatu waybill, Mtaani agent code),
internal notes, "record payment received" for cash at the counter, and a
printable packing slip.

Two behavioural fixes worth knowing about:
- Checkout now **refuses to oversell**. Previously stock could go negative.
- Cancelling an order **rolls back the customer's CRM totals**, which previously
  drifted upward permanently on every cancellation.

### Payment API keys from the dashboard (`/settings` -> Payments)
M-Pesa and Africa's Talking credentials now live in the database and are
editable in the UI. Resolution is **database -> environment -> default**, so your
current Railway variables keep working untouched until you save something in the
dashboard. Saved keys take effect on the very next checkout — no redeploy.

Secrets are never returned to the browser in full; you see `******4821`, enough
to confirm which key is loaded. Blank means "keep the saved one", so you can't
overwrite a working key with its own placeholder. There's a **Test connection**
button for each — it authenticates against Daraja and reads your AT balance, so
you find out the keys are wrong now rather than at a customer's checkout.

### Product photos
Multiple photos per product, uploaded from your phone or computer, reorderable,
with the first as the main image. Editing a product now edits its photos —
previously images could only be set at creation.

Images are **stored in Postgres**, not on disk. Railway containers have an
ephemeral filesystem, so anything written to disk vanishes on the next deploy —
your product photos would disappear every time you shipped a change. This also
means no S3 bucket is needed to launch. If the catalogue grows past a few
hundred photos, swap `media.routes.ts` for object storage; nothing else changes,
because products only ever store a URL.

The browser downscales each photo before upload (max 1600px, JPEG q0.82), so a
6 MB phone snap arrives at roughly 250 KB. That keeps uploads fast, the shop
fast for customers on mobile data, and means the API needs no image library.

Deleting: a product that's never been ordered is deleted permanently. One that
appears on past orders is **hidden** instead, because deleting it would destroy
order history — the UI explains this rather than just failing.

### Customer accounts
Sign-up, sign-in (by phone *or* email), profile editing, password change and
order history at `/account`. Phone stays the identity — it's what M-Pesa and
delivery key on — but name and email are captured properly.

A guest who checked out before already has a customer record keyed by phone;
registering with that number **claims the existing record** and keeps their
order history rather than creating a duplicate. Checkout autofills for
signed-in customers, and if a guest types a number that already has an account
it offers a sign-in link — while still letting them continue as a guest.

### Customers (`/customers`)
Every checkout upserts a customer by phone, so this list builds itself whether
or not the buyer registered. Shows email and phone as click-to-contact links,
flags who has an account, and exports the whole list to CSV. Staff-only — none
of it is reachable from the storefront. Password hashes are never selected out
of the database, only a boolean saying whether one exists.

### Dashboard
Revenue this month with a month-on-month percentage, today's takings, the
packing queue at a glance, and customer growth. The revenue chart zero-fills
missing days so a quiet week reads as a genuine dip rather than skipping across.

---

## Running locally

```bash
# backend
cd backend && cp .env.example .env    # fill DATABASE_URL
npm install && npm run db:push && npm run seed && npm run dev

# storefront
cd storefront && cp .env.example .env.local && npm install && npm run dev

# admin
cd admin && npm install && npm run dev
```

Seeded admin: `admin@enzipackaging.co.ke` / `changeme123` — change it
immediately, or seed with your own: `ADMIN_PASSWORD='...' npm run seed`.

---

## Railway configuration

Three services from one repo. Each needs its **Root Directory** set, or Railpack
looks at the repo root, sees three folders, and can't determine how to build.

**Backend** — Root Directory `backend`. Add the Postgres plugin and point
`DATABASE_URL` at it. Set `JWT_SECRET`. Leave `CORS_ORIGINS` blank unless you
have a specific reason. After first deploy: `npm run db:push && npm run seed`.

**Storefront** — Root Directory `storefront`. Set `NEXT_PUBLIC_API_URL` to the
backend's public URL, plus `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_WHATSAPP`.

**Admin** — Root Directory `admin`. Set **`API_URL`** to the backend's public
URL. Build runs `tsc --noEmit && vite build`; start runs
`node gen-env.mjs && serve -s dist` (`serve` is a runtime dependency, not a dev
one, so it survives Railway's production prune).

### Getting M-Pesa live
1. Settings -> Payments, paste your Daraja consumer key, secret, shortcode and passkey.
2. Set the callback URL to `https://<your-backend>.up.railway.app/api/payments/mpesa/callback`.
   **Payments never confirm without this** — Safaricom has nowhere to report success.
3. Hit **Test M-Pesa connection**. Fix anything it reports.
4. Run one real sandbox order end to end, then switch Environment to production.

---

## API surface (mounted under `/api`)

| Route | Purpose |
|---|---|
| `auth` | Staff login; customer register / login / profile / orders |
| `staff` | Staff account CRUD, role changes, password resets (admin only) |
| `products` | Public catalogue + staff CRUD with images, duplicate, restore |
| `media` | Image upload and serving |
| `orders` | Cart pricing, checkout, receipts, staff fulfilment + counts |
| `payments` | M-Pesa STK initiate, Daraja callback, status poll |
| `customers` | CRM list / detail / tagging / CSV export (staff) |
| `stock` | Restock, movement ledger, audit open/count/close |
| `sms` | Segment preview, single send, campaigns |
| `stats` | Dashboard overview, revenue series, top products |
| `settings` | Business config + payment/SMS credentials, connection tests |
| `categories`, `delivery-methods`, `promotions`, `reviews`, `blog`, `faqs` | Content |

---

## Known limits / next steps

- **Ad campaigns.** What's built is SMS marketing via Africa's Talking —
  segments, previews, campaigns. Actual Meta or Google ad campaigns need those
  platforms' business accounts and API access; that's a separate integration and
  isn't something this codebase can do on its own.
- **Order confirmation SMS/email** doesn't fire automatically on checkout yet.
  The sending machinery exists (`sms.service.ts`); it needs a call in
  `placeOrder` and a message template.
- **Customer password reset** is manual — no "forgot password" flow, since that
  needs a transactional email provider set up on the domain.
- **Image storage** is Postgres, which is right for launch and wrong at scale.
  See the note above.

---

## Build status

Verified in this drop:

- `admin` — `tsc --noEmit` clean, `vite build` succeeds.
- `storefront` — `tsc --noEmit` clean, `next build` succeeds (all 15 routes).
- `backend` — typechecks clean against the source; the Prisma client can only be
  generated where `binaries.prisma.sh` is reachable, so full client-type
  validation happens on Railway's build. Every `prisma.<model>` accessor and
  every field used by the new code was cross-checked against `schema.prisma`
  by hand.

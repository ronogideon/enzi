# Enzi Packaging — commerce platform

v0.2.1 · Node/Express/TypeScript/Prisma/Postgres, deployed on Railway.

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

> **If `db:push` or `seed` previously failed with "command not found", that was
> the bug.** `prisma` and `tsx` were devDependencies, and Railway prunes
> devDependencies from the production image — so neither command existed in the
> deploy shell. Both are now runtime dependencies, and the backend creates an
> owner account by itself on first boot regardless. See
> "Why the admin password didn't work" below.

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

---

## Why the admin password didn't work

The seed never ran. `npm run seed` executes through `tsx`, which was a
**devDependency** — and Railway prunes devDependencies out of the production
image. So the command failed with `tsx: not found`, no staff account was ever
created, and the login endpoint correctly answered "invalid email or password"
because there was genuinely nothing to match. The same applied to `npm run
db:push`, which needs the `prisma` CLI.

Fixed four ways, so this can't be a dead end again:

1. **`prisma` and `tsx` moved to `dependencies`**, so the documented shell
   commands actually exist in the deployed container.
2. **The backend creates an owner account on boot** if the staff table is
   completely empty (`src/lib/bootstrap.ts`), printing the credentials into the
   deploy log. It needs only `@prisma/client` and `bcryptjs`, both production
   deps, so it works no matter how the image is pruned. It only ever fires on
   an empty table, so it can't resurrect an account you deleted on purpose.
3. **`/api/health` now reports `setupRequired` and `database`**, and the login
   page uses them: it says "no staff account exists yet" or "the database has no
   tables yet" instead of letting you retype a password that was never wrong.
4. **Recovery scripts are plain CommonJS** (`backend/scripts/`), needing no
   TypeScript runner at all.

### Getting in now

Easiest — just **redeploy the backend** and read the log:

```
================================================================
[enzi] No staff accounts existed, so an owner account was created:

    Email:    admin@enzipackaging.co.ke
    Password: changeme123
================================================================
```

To set your own instead, add `ADMIN_EMAIL` and `ADMIN_PASSWORD` as Railway
variables before that first boot.

Already have accounts but can't get in? From the backend's Railway shell:

```bash
npm run whoami          # lists which accounts exist — no hashes printed
ADMIN_EMAIL=you@enzipackaging.co.ke ADMIN_PASSWORD='a-new-password' npm run reset-admin
```

Or, without a shell at all: set `ADMIN_RESET_PASSWORD` in Railway, redeploy,
then **delete the variable** — while it's set, the password resets on every
deploy, and the logs will keep telling you so.

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
order history at `/account`. The sign-up form validates as you type: email
format with plain-language messages ("the part after @ needs a dot"), common
domain typos surfaced as suggestions ("did you mean jane@gmail.com?"), and
debounced availability checks against the API so a clash on an email or phone
shows up while the field is still in front of you rather than on submit. Phone stays the identity — it's what M-Pesa and
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

**Storefront** — Root Directory `storefront`. Set `API_URL` to the backend's
public URL (include `https://`), and `WHATSAPP` to your number. Both are read at
runtime, so changing them needs only a restart.

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

## Sessions

Lifetimes differ by who holds the token, because the cost of a stolen one
differs enormously.

| | Lifetime | Idle sign-out |
|---|---|---|
| **Staff / admin** | 8 hours | 30 minutes |
| **Customer** | 90 days | none |

An admin token can read every customer's phone number, change payment
credentials and issue refunds — and the dashboard is routinely left open on a
shared computer at the shop counter. So the token is short-lived *and* the app
signs out on inactivity, with a warning at two minutes so nobody loses a
half-typed product. The login page then says why they were signed out rather
than appearing to have forgotten them.

A stolen customer token, by contrast, gets someone that customer's own order
history and the ability to place an order that still needs their M-Pesa PIN on
their own phone to pay. Making shoppers log in repeatedly costs real sales and
buys almost nothing.

Both are overridable via `STAFF_SESSION_TTL` and `CUSTOMER_SESSION_TTL`, kept
separate so raising the customer value can't silently extend admin sessions too.

---

## SMS: Talk Sasa

SMS goes through Talk Sasa's v3 API (JSON + bearer token). The API token is
stored encrypted with the payment credentials, and the base URL is a setting
rather than a constant — bulk SMS resellers move endpoints more often than
you'd like, and a hardcoded host means a redeploy to fix a delivery outage.

`sendSms()` remains the single call site for order notifications, campaigns and
one-off sends, so swapping providers again is one file rather than a search
across the codebase.

**Register your sender ID with Talk Sasa.** An unregistered sender is the
commonest reason messages disappear with no error at all, so the connection test
reads your credit balance back *and* reports the configured sender ID.

The old `AT_*` environment variables are still read as a fallback for the token
and sender ID, so an existing deployment keeps sending until Talk Sasa is set up.

---

## Credentials are encrypted at rest

Payment API keys used to sit in the `Setting` table as plain text. Anyone with a
read of that table — a leaked backup, a misconfigured `DATABASE_URL`, someone
running a support query — could take the shop's M-Pesa and Kopo Kopo keys and
move real money.

They're now encrypted with **AES-256-GCM** before they ever reach Postgres
(`backend/src/lib/crypto.ts`). GCM means the ciphertext is authenticated, so a
tampered value fails to decrypt rather than silently producing garbage that gets
sent to Safaricom. A database dump on its own is no longer enough — an attacker
also needs the key, which lives in the environment.

The key comes from `SETTINGS_KEY` if set, otherwise it's derived from
`JWT_SECRET` via scrypt. Deriving is deliberate: an existing deployment starts
encrypting the moment it updates, with no new variable to set. Set
`SETTINGS_KEY` explicitly if you ever want to rotate `JWT_SECRET` independently
of the stored credentials.

**Nothing needs migrating by hand.** Values stored before this change are still
plain text and still work; a startup pass encrypts them in place, and the reader
returns anything not in our format unchanged. If a key ever can't be decrypted,
it reads as "not configured" — the gateway refuses to charge and the Settings
page shows it as unset, which is the safe failure. Secrets are still never
returned to the browser in full.

---

## Payment gateways

Two options, chosen in **Settings → Payments**. Only one processes money at a
time, so it's presented as a choice rather than two parallel forms — pick the
provider, enter its keys, test the connection, then make it live. Showing both
side by side invited the failure mode of half-configuring one while the other
was silently in use.

Customers see the same M-PESA prompt either way; the difference is who you hold
the merchant relationship with.

| | M-Pesa (Daraja) | Kopo Kopo |
|---|---|---|
| Settles to | Your own paybill/till | Your Kopo Kopo till |
| Onboarding | Safaricom developer portal | Kopo Kopo dashboard |
| Cost | Safaricom's rates | Plus a K2 transaction fee |
| Reconciliation | Yours to build | K2 dashboard |

**The endpoint is gateway-agnostic.** The storefront posts to `/payments/stk`
and the server picks the configured provider — the shop never knows or chooses.
`/payments/mpesa/stk` is kept as an alias so an older deployed storefront keeps
working through a rollout.

If the selected gateway isn't fully configured, checkout falls back to whichever
one is. A half-finished switch can't take the shop offline.

### Kopo Kopo specifics

- Credentials live in the database like the M-Pesa keys, so they're editable
  from the dashboard with no redeploy. Editing them drops the cached OAuth
  token immediately.
- **The webhook signature is verified.** Kopo Kopo signs the raw body with
  HMAC-SHA256 using your API key; the route is mounted with a raw body parser
  because re-serialising parsed JSON would change byte order and break
  verification. Without this, anyone who learned the callback URL could mark
  orders paid. If no API key is set the webhook still works but logs a warning
  on every call — set the key.
- Register `https://api.enzipackaging.com/api/payments/kopokopo/callback` in the
  Kopo Kopo dashboard as well as in Settings.
- Duplicate webhook deliveries are ignored once a payment is already `PAID`.

`Payment` gained `providerRef` and `receiptRef` so a second gateway doesn't have
to masquerade as Daraja in the M-Pesa-named columns.

---

## Delivery zones

A single flat fee per method never survived contact with reality: riding to
Kilimani and couriering to Kisumu cost very different amounts, so the shop had to
either lose money on far orders or overcharge near ones.

Each delivery method can now carry **priced areas** — "Nairobi CBD", "Westlands",
"Upcountry" — with an optional per-zone free-delivery threshold. Store pickup
never has zones, and the API enforces that rather than leaving it to the UI.

A method with zones **requires** one at checkout. Otherwise someone upcountry
could check out at the CBD rate simply by not choosing an area. The server
recalculates the fee at order time from the zone actually chosen; the storefront
figure is only so the customer sees the right number before committing. Orders
record which zone priced them (`Order.deliveryZoneId`), so a later price change
doesn't rewrite history.

A method with no zones falls back to its flat `baseCost`, so existing setups keep
working untouched.

---

## Categories

These were creatable through the API but had no screen, so in practice there was
no way to make one — every product ended up uncategorised and the storefront's
category navigation was empty. There's now a Categories page (create, rename,
describe, reorder, hide, delete).

Deleting a category leaves its products in the shop, just uncategorised, and the
confirmation says how many are affected before it happens.

The product form also has **+ New category…** in its dropdown, which creates and
selects one inline. Realising you need a category happens mid-way through adding
a product, and losing a half-filled form to go and make one is precisely why
things end up uncategorised.

---

## Blog and FAQs

Both are now fully editable from the admin — create, edit, publish, reorder,
delete.

### The editor writes Markdown, not HTML

That's a deliberate security decision. Storing HTML from an editor means
anything a staff account pastes ends up in every visitor's browser, so one
compromised staff login becomes a script injection on the shop. Instead, posts
are stored as Markdown and rendered by a ~180-line renderer that escapes
everything first and emits a fixed set of tags. There is no path from stored
text to arbitrary markup. Link URLs are filtered too — `javascript:` and
`data:` hrefs are dropped, `http(s)`, `mailto`, `tel` and internal paths pass.

Nobody has to learn the syntax. The toolbar inserts it, and a live preview sits
beside the text showing exactly what visitors will see. Images upload straight
from the composer (downscaled in the browser first, same as product photos) and
land inline. Links are clickable, external ones get `rel="noopener"`.

The editor opens full-screen rather than in a dialog — writing a post in a 500px
modal is miserable, and this is the one admin task that needs room.

Deleting a post frees any uploaded images it owned that nothing else references.

FAQ answers accept the same Markdown, so a support answer can link to a product
instead of describing where to find it. Order is set with up/down buttons —
reliable on touch, where drag-and-drop fights with page scrolling — and saved in
one atomic call.

---

## Icons

A hand-rolled set (`components/Icons.tsx`), shared between both apps. About
thirty glyphs, all 24×24 stroke paths on the same grid at the same 1.75 stroke
width, so none looks heavier than its neighbours. No icon dependency: a package
would ship a few thousand glyphs to use thirty.

Icons beside text labels are `aria-hidden` — announcing the label twice is worse
than not announcing the icon. Icon-only controls take a `title`.

The admin sidebar is now grouped into **Shop / Content / Admin** with an active
marker on the left edge, because a colour change alone is easy to miss on a dark
sidebar, and twelve flat links is a wall to scan.

---

## Wholesale is automatic

There is no tier selector anywhere in the shop — not on the cart, not at
checkout, not on a product page. Wholesale is decided by quantity:

> if a product has a wholesale price and you order at least its wholesale
> minimum, you get that price.

Two consequences worth knowing:

- **It's decided per line, not per cart.** A big order of mailers and two rolls
  of tape prices each correctly, instead of forcing one tier across both.
- **The client can't ask for it.** `POST /orders/price` and `POST /orders` no
  longer accept a meaningful `tier`; the server derives it. Previously a crafted
  request could buy a single unit at the bulk rate.

The product page states the threshold plainly next to the minimum order
quantity ("Wholesale minimum: 50 pcs"), the price updates live as the quantity
crosses it, and the crossing is confirmed with a 2-second toast and a confetti
burst. When someone is within a short reach of the threshold, a single button
offers to close the gap. The cart shows total wholesale savings, because a price
lower than expected otherwise just looks like a bug.

### One selection across every colour

Colours are separate listings, but wholesale is earned across them: 60 black
and 40 pink of the same size is 100 of that size, and the cart prices it that
way. So the product page holds **one selection for the whole colour group**.

- A quantity typed against black survives switching to pink. The colour chip
  carries a small green bubble with the pieces held against it.
- **Add to cart adds the lot** — every colour, every size, in one action. The
  button says how many pieces it will add.
- The running total, the per-row price and the "wholesale" tag all count the
  combined quantity, using the same grouping key as the cart (size plus unit
  price). The page cannot promise a rate the cart then refuses.
- The selection is kept in `sessionStorage` under `enzi.pdp.v1.<groupId>`, so a
  reload, a look at the cart, or a tap on a sibling's real URL comes back to
  what was chosen. It is cleared once the batch is added, and anything that has
  since sold out is dropped when it is restored.

Colour switching uses `history.replaceState`, not `router.replace`. The URL
still updates, but there is no navigation — a navigation re-renders the server
component and remounts the panel, which is exactly how the selection used to be
lost on every switch.

---

## Motion

Animations follow one rule: every one has a purpose, and none of them are
decoration for its own sake.

- **Custom easing.** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for anything
  entering or responding to a click; `--ease-drawer` for the admin drawer. The
  built-in CSS easings are too weak to read as deliberate. `ease-in` is used
  nowhere — it delays the first frame, which is exactly when someone is looking.
- **Everything under 300ms.** Entrances are 220–460ms, presses 160ms.
- **Press feedback everywhere.** `scale(0.97)` on `:active` for every button.
- **Staggered grids.** 45ms between cards, capped at 300ms total.
- **Hover gated behind `(hover: hover) and (pointer: fine)`**, or a tap on a
  phone leaves a card stuck in its hover state.
- **Exit faster than enter.** Toasts arrive over 260ms and leave in 180ms: the
  arrival earns a beat, the system responding should feel immediate.
- **`prefers-reduced-motion` keeps opacity and drops movement**, rather than
  killing everything — fades still aid comprehension. Confetti is skipped
  entirely; celebration is the first thing that should go.

The toast system is ~200 lines with no dependency. Timers pause when the tab is
hidden, so a toast fired just before someone switches away is still there when
they come back.

---

## The admin on a phone

The admin is used standing at a packing bench, so it now works there:

- **Slide-in drawer** instead of a horizontally scrolling strip of ten tab
  labels, half of which were off-screen with no sign they existed.
- **Bottom bar** with the four screens used during a shift — Home, Orders,
  Products, Stock — one thumb-tap away.
- **Card views instead of tables** on Products, Orders, Staff and Customers. A
  nine-column table on a 390px screen is a horizontal scrollbar and a guessing
  game.
- **Modals become bottom sheets** below `sm`, with a grab handle and a body that
  scrolls while the title stays put.
- **16px form text on small screens**, because iOS zooms the whole page when a
  focused input is smaller and the layout jumps on every tap.

### The toggle bug

The switch knob was `position: absolute` with no `left`, so it fell back to its
static position — and since a `<button>` centres its inline content, that was
the middle of the track. Translating right from there put the knob outside the
pill entirely. It's now anchored at `left-0.5` and travels a measured 20px
(44px track − 20px knob − 2px padding either side), so it stays inside at both
ends. It also reports `role="switch"` rather than `aria-pressed`, which is what
it actually is.

---

## Configuration is read at runtime, not baked into the build

`NEXT_PUBLIC_*` variables are compiled into the JavaScript bundle by Next.js at
**build** time. That made a wrong API address impossible to correct by editing a
Railway variable — the old value stayed in the bundle until a full rebuild, and
restarting the service changed nothing.

The storefront now resolves its API address the same way the admin always has:
`process.env` is read on the server at request time and handed to the browser
via a small `window.__ENV__` script in the root layout. Nothing is compiled in.
Set `API_URL`, restart, done.

`NEXT_PUBLIC_API_URL` still works as a fallback so local development and any
existing setup keep running.

### The missing-scheme trap

A bare hostname is not an absolute URL. Given `api.enzipackaging.com`, the
browser treats it as a **relative path** and resolves it against the current
page, so every API call goes back to the storefront, which answers with an HTML
404. The symptom is an error naming a URL with no `https://` in front of it.

Railway's `${{service.RAILWAY_PUBLIC_DOMAIN}}` reference resolves to exactly
such a bare host, which makes this easy to hit by accident. Both frontends now
add a missing scheme (`https://`, or `http://` for localhost), and the
storefront logs a note when it has had to do so. Write the full URL anyway.

### Startup diagnostics

`npm start` runs `check-env.mjs` first, which prints the resolved address and
probes `/health`:

```
[storefront] API_URL = https://api.enzipackaging.com/api
[storefront] API reachable (v0.4.1, database: ok)
```

It never blocks boot — a storefront that can't reach its API should still serve
pages so customers can browse and reach you on WhatsApp while it's fixed.

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
- Recovery paths (`bootstrap.ts`, `scripts/*.js`) depend only on production
  packages, so they survive Railway's devDependency pruning.
- `baseUrl` removed from the admin tsconfig — `paths` has worked without it
  since TS 4.4, and it is deprecated in TS 7.
- `backend` — typechecks clean against the source; the Prisma client can only be
  generated where `binaries.prisma.sh` is reachable, so full client-type
  validation happens on Railway's build. Every `prisma.<model>` accessor and
  every field used by the new code was cross-checked against `schema.prisma`
  by hand.

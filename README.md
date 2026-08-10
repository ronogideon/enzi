# Enzi Packaging — commerce platform

Ground-up rebuild of enzipackaging.co.ke in the Node/Express/TypeScript/Prisma/Postgres
stack, deployable to Railway. Replaces the broken PHP/MySQL site.

## Architecture (target)

| Service | Stack | Railway service | Purpose |
|---|---|---|---|
| `backend/` | Express + TS + Prisma + Postgres | API service | All business logic, one API for both frontends |
| `storefront/` | Next.js (SSR) | web service | Customer-facing shop (SEO-indexed product pages) — **Phase 2** |
| `admin/` | React + Vite (SPA) | web service | Staff/admin portal, role-based routing — **Phase 3** |

Split rationale: the shop needs server rendering for SEO (product pages must be
crawlable); the admin is an internal tool with no SEO need, so a Vite SPA is lighter
and matches the Kodee portal pattern.

---

## What's in this drop (Phase 1 — backend foundation)

The complete data model plus the load-bearing business logic. This is the part where
getting the schema right matters most, so it's what to review first.

### Key modeling decisions to sign off on
- **Money as integer cents** (KES × 100) everywhere — no float drift.
- **Dual-tier pricing** on every product (`retailPrice` / `wholesalePrice`) with
  per-tier minimum quantities. A **promotions** table (per-product or category-wide,
  tier-scoped, time-boxed) resolves to a single best effective price at pricing time.
- **Retail min-qty auto-bump**: carts below a product's retail minimum are *raised* to
  the floor rather than rejected — so you can only ever check out at/above minimum
  (the thing that was broken on the old site). See `cart.service.ts`.
- **POD toggle per delivery method**: checkout branches on `deliveryMethod.podAllowed`.
  POD-allowed → order goes straight to `CONFIRMED` (pay on delivery). POD-off → order is
  `PENDING_PAYMENT`, an STK push fires, and the M-Pesa callback flips it to paid.
  **Parcel (Matatu)** and **Pickup Mtaani** are force-set non-POD regardless of the flag.
- **Phone as customer identity** (2547…): guests are upserted by phone at checkout, so
  every order builds the CRM automatically (order count / total spent / last order — used
  for SMS segments and reorder campaigns).
- **Stock ledger**: every movement (sale, restock, audit adjustment, cancellation) is
  recorded in `StockMovement`; audits snapshot system qty, capture physical counts, and
  post variances back to stock on close.

### API surface (mounted under `/api`)
- `auth` — staff login, customer register/login (JWT)
- `products` — public list/featured/detail (+ effective price), staff CRUD w/ images
- `categories`, `delivery-methods`, `faqs`, `reviews`, `blog` — content
- `orders` — `POST /price` (cart preview w/ min-qty+promos), `POST /` (place, POD branch),
  `GET /number/:orderNumber` (receipt), staff list/fulfilment transitions
- `payments` — `POST /mpesa/stk` (initiate), `POST /mpesa/callback` (Daraja), status poll
- `promotions` — promo-rate setup (staff)
- `stock` — restock, movement ledger, audit open/count/close
- `customers` — CRM list/detail/tagging (staff)
- `sms` — segment preview, single send, campaign create/run (Africa's Talking)
- `stats` — dashboard overview + 30-day revenue series
- `settings` — business config key/value (admin)

---

## Running the backend

```bash
cd backend
cp .env.example .env          # fill DATABASE_URL + M-Pesa + AT creds
npm install                   # runs prisma generate (needs network to prisma binaries)
npm run db:push               # create tables in your Postgres
npm run seed                  # categories, sample products, delivery methods, admin
npm run dev                   # http://localhost:4000/health
```

Seeded admin: `admin@enzipackaging.co.ke` / `changeme123` (change immediately).

### Railway
Same flow Dartbit/Kodee use: `postinstall` runs `prisma generate`, `build` runs
`prisma generate && tsc`, `start` runs `node dist/index.js`. Set env vars in the Railway
service. Point `MPESA_CALLBACK_URL` at the deployed `/api/payments/mpesa/callback`.

> Note: the Prisma client can only be generated where the Prisma binary host is reachable
> (i.e. Railway's build), so full Prisma-type validation happens there — the rest of the
> TypeScript typechecks clean locally.

---

## Roadmap

- **Phase 1 — backend foundation** ← *this drop*
- **Phase 2 — storefront (Next.js)**: dark theme from the screenshots, product listing,
  category mega-menu, product detail, cart with pre-login editing, the POD checkout flow,
  M-Pesa STK wait screen, receipt/invoice. Fixes the old bugs: banner shuffle, category
  slider z-index, image loading.
- **Phase 3 — admin/staff portal (Vite)**: dashboard stats, product listing UI, promo-rate
  setup, stock audit UI, SMS campaigns, customer CRM, delivery/settings, role-based access.
- **Later**: push notifications on new orders, transactional emails on the enzipackaging.co.ke
  domain, Kopo Kopo as an alternate payment provider (already modeled in the schema).
```

---

## Deploying on Railway (monorepo — two services, one repo)

This repo holds two independent apps. Railway must be told which subfolder each
service builds from — otherwise Railpack looks at the repo root, sees two
folders, and can't determine how to build (the "could not determine how to build
the app" error).

Create **three services** from the same repo and set each one's **Root Directory**:

**Backend service**
- Settings → Root Directory: `backend`
- Railway auto-detects Node. Install runs `postinstall` (`prisma generate`),
  then `npm run build` (`prisma generate && tsc`), then `npm start`.
- Add env vars from `backend/.env.example` (DATABASE_URL, MPESA_*, AT_*, JWT_SECRET…).
- Add a Postgres plugin and point `DATABASE_URL` at it. After first deploy run
  `npm run db:push` and `npm run seed` (Railway shell or a one-off command).

**Storefront service**
- Settings → Root Directory: `storefront`
- Env: `NEXT_PUBLIC_API_URL` = the backend service's public URL + `/api`
  (e.g. `https://enzi-backend.up.railway.app/api`), plus `NEXT_PUBLIC_SITE_URL`
  and `NEXT_PUBLIC_WHATSAPP`.

**Admin service** (staff/admin portal)
- Settings → Root Directory: `admin`
- Build runs `tsc --noEmit && vite build`; start runs
  `node gen-env.mjs && serve -s dist` (a production static server with SPA
  fallback, so client-side routes survive a refresh — `serve` is a runtime
  dependency, not a dev one, so it survives Railway's prod prune).
- Set **`API_URL`** = the backend's public URL + `/api`. `gen-env.mjs` writes
  it into `dist/env.js` at container start, so the same build works in any
  environment without a rebuild (no build-time baking). A build-time
  `VITE_API_URL` is also honoured as a fallback.
- First login uses the seeded superadmin: `admin@enzipackaging.co.ke` /
  `changeme123` — change it immediately.
- Roles: SUPERADMIN/ADMIN see everything; STAFF gets Dashboard, Orders,
  Products, Stock; SUPPORT gets Dashboard, Orders, Customers.

### Security scan
Railway blocks deploys on vulnerable dependencies. This drop ships:
- Storefront pinned to `next@^14.2.35` (clears the flagged CVEs) with `postcss`
  forced to `8.5.26` via an `overrides` entry.
- Backend with **zero** advisories — the Africa's Talking SDK (which pulled in a
  vulnerable `lodash`) was dropped in favour of calling the AT REST API directly
  with `axios`. Lockfiles are committed so the scan sees the pinned versions.
- Admin on `vite@^8` + `@vitejs/plugin-react@^6` (with `esbuild` overridden to
  `^0.25`), which clears the high-severity Vite dev-server advisories. The
  remaining `react-router` items are moderate and dev/CSR-only (the SSR-hydration
  one doesn't apply to this client-rendered SPA).

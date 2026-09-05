# Deploy checklist — Enzi v0.4.1

Do these in order.

---

## 1. Backend: redeploy, then push the schema

Deploy the new backend code first, then in its Railway shell:

```bash
npm run db:push
```

If this previously said `prisma: not found`, that was the bug — `prisma` was a
devDependency and Railway strips those from the production image. It's a runtime
dependency now, so the command works.

## 2. Read the backend deploy log — your login is in it

On boot, if no staff account exists, the backend creates one and prints:

```
================================================================
[enzi] No staff accounts existed, so an owner account was created:

    Email:    admin@enzipackaging.co.ke
    Password: changeme123
================================================================
```

**That is why `changeme123` didn't work before: the account was never created.**
`npm run seed` runs through `tsx`, which Railway had pruned, so the seed silently
failed and there was nothing to sign in to.

To pick your own credentials, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in Railway
*before* this deploy.

## 3. Admin: set the API URL

Railway → **admin** service → Variables:

```
API_URL = https://<your-backend-service>.up.railway.app
```

Redeploy. The log should print the resolved URL. The login page now tells you
which of these is wrong, instead of failing silently:

| What you see | What it means |
|---|---|
| "Can't reach the API" | `API_URL` is wrong, or the backend is down |
| "The database has no tables yet" | Step 1 didn't run |
| "No staff account exists yet" | Step 2 hasn't happened — no password will work |
| "Invalid email or password" | The account exists; this one really is the password |

## 4. Storefront: set the API URL — this is your signup 404

Railway → **storefront** service → Variables:

```
NEXT_PUBLIC_API_URL = https://<your-backend-service>.up.railway.app
```

**Then redeploy the storefront.** Next.js bakes `NEXT_PUBLIC_*` values in at
*build* time, so setting the variable without rebuilding changes nothing.

Your "Request failed 404" was the browser getting an HTML page instead of JSON —
the request never reached the backend at all. A real backend 404 would have said
"No route for POST /api/…". The sign-up page now checks the connection on load
and says plainly which address it's trying, rather than failing on submit.

Quick check from your own machine:

```bash
curl https://<your-backend-service>.up.railway.app/api/health
```

Expect JSON with `"ok": true`. Anything else — HTML, a redirect, nothing — and
the URL is wrong.

---

## 5. Once you're in

- [ ] **Settings → My account** — change the default password.
- [ ] **Settings → Payments** — Daraja keys, callback URL set to
      `https://<your-backend>.up.railway.app/api/payments/mpesa/callback`,
      then **Test M-Pesa connection**. Payments never confirm without that URL.
- [ ] **Settings → SMS** — Africa's Talking credentials. Test it.
- [ ] **Staff accounts** — add your employees. Packers get the **STAFF** role:
      orders, packing and stock, but not your payment keys. Each gets a
      temporary password shown once — copy it before closing the dialog.
- [ ] **Products** — upload real photos on one product, then confirm it appears
      on the storefront product page.
- [ ] **Storefront** — register an account, then place a test order end to end.
- [ ] **Orders → To pack** — walk it: start packing → packed → shipped. Check
      your name appears against each step in the history sidebar.

---

## Stuck?

From the backend's Railway shell:

```bash
npm run whoami        # which staff accounts exist (never prints hashes)

ADMIN_EMAIL=you@enzipackaging.co.ke \
  ADMIN_PASSWORD='choose-something-strong' npm run reset-admin
```

No shell access? Set `ADMIN_RESET_PASSWORD` in Railway, redeploy, sign in, then
**delete that variable** — while it's set your password resets on every deploy,
and the logs will keep warning you.

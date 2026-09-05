# Deploy checklist — Enzi v0.4.0

Do these in order. Steps 1–3 fix the login; the rest turns on the new features.

---

## 1. Push the schema (backend service, Railway shell)

```bash
npm run db:push
```

Additive only — new columns are nullable or defaulted, so existing products,
orders and customers are untouched.

## 2. Set the admin's API URL  ← this is the login fix

Railway → **admin** service → Variables:

```
API_URL = https://<your-backend-service>.up.railway.app
```

The trailing `/api` is added automatically, so either form works.

## 3. Redeploy the admin, then check the deploy log

You should see:

```
[gen-env] API_URL = https://<your-backend>.up.railway.app/api
```

If you instead see the boxed `API_URL IS NOT SET` warning, step 2 didn't take.

Now sign in with `admin@enzipackaging.co.ke` / `changeme123`.

**If it still won't connect:** the login page will tell you the exact URL it
tried and give you a field to correct it in-browser, so you can get in and
diagnose from inside. If you're locked out entirely, from the backend shell:

```bash
ADMIN_EMAIL=you@enzipackaging.co.ke ADMIN_PASSWORD='something-strong' npm run reset-admin
```

---

## 4. First things to do once you're in

- [ ] **Settings → My account** — change the default password immediately.
- [ ] **Settings → Payments** — paste your Daraja keys, set the callback URL to
      `https://<your-backend>.up.railway.app/api/payments/mpesa/callback`,
      then hit **Test M-Pesa connection**. Payments cannot confirm without that
      callback URL.
- [ ] **Settings → SMS** — Africa's Talking username, API key, sender ID. Test it.
- [ ] **Staff accounts** — add your shop employees. Give packers the **STAFF**
      role: they get orders, packing and stock, but not your payment keys.
      Each gets a temporary password shown once — copy it before closing.
- [ ] **Products** — open one and upload real photos to confirm uploads work
      end to end. Check the photo then appears on the storefront product page.
- [ ] **Storefront** — create a customer account at `/account/register` and run
      one test order all the way through checkout.

## 5. Verify the packing flow

Place a test order, then in **Orders → To pack**: start packing → mark packed →
mark shipped. Confirm the order history in the sidebar shows your name against
each step. That's what your employees will use daily.

---

## Storefront variable (if not already set)

Railway → **storefront** service:

```
NEXT_PUBLIC_API_URL = https://<your-backend-service>.up.railway.app
```

Needed for product photos to load, since images are served by the API.

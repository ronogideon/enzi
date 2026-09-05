# Deploy checklist — Enzi v0.4.2

Backend is confirmed healthy at `api.enzipackaging.com`. This drop fixes the
storefront's API address, which was compiled into the build and therefore
unfixable from Railway variables.

---

## 1. Storefront service — replace the variable

**Remove:**

```
NEXT_PUBLIC_API_URL
```

**Add:**

```
API_URL  = https://api.enzipackaging.com
WHATSAPP = 254110050620
```

`API_URL` is now read at runtime, so from this deploy onward you can change it
and just restart — no rebuild.

Two rules for the value:

- **Include `https://`.** A bare hostname isn't an absolute URL, so the browser
  treats it as a relative path and sends every call back to the storefront. That
  is exactly what produced `enzi-production.up.railway.app/api/auth/customer/login`
  with no scheme in front of it. The code now adds a missing scheme, but be
  explicit.
- **Don't use Railway's `${{service.RAILWAY_PUBLIC_DOMAIN}}` reference.** It
  resolves to a bare host with no scheme — the same trap.

The trailing `/api` is added for you.

## 2. Redeploy the storefront, then read the log

You should see:

```
[storefront] API_URL = https://api.enzipackaging.com/api
[storefront] API reachable (v0.4.1, database: ok)
```

If instead you get the boxed `API_URL IS NOT SET` warning, or a
`could not reach` line, the variable is wrong and the log says how.

## 3. Verify in the browser

Open the shop and check the console:

```js
window.__ENV__
// { API_URL: "https://api.enzipackaging.com/api", WHATSAPP: "254110050620" }
```

That value now comes from the server on each request. If it's wrong, fix the
variable and restart — you no longer need a rebuild to change it.

Then try signup. Product images loading is the other good signal, since those
are served from the API too.

## 4. Admin service — when you add the custom domain

`API_URL` stays as it is:

```
API_URL = https://api.enzipackaging.com
```

Nothing to change. Point `dashboard.enzipackaging.com` at the admin service and
it keeps working.

## 5. Backend — leave CORS open

```
CORS_ORIGINS = (blank)
```

Blank reflects any origin, which is safe here because auth is a Bearer token in
a header, not a cookie. You're currently serving from six origins (three custom
domains plus three Railway ones); an allow-list that misses any of them fails
only on that origin, which is a miserable thing to debug.

Also update in the admin, **Settings → Payments**:

```
Callback URL = https://api.enzipackaging.com/api/payments/mpesa/callback
```

Then hit **Test M-Pesa connection**.

---

## Then work through the shop

- [ ] **Settings → My account** — change the default password if you haven't.
- [ ] **Staff accounts** — add your employees. Packers get **STAFF**: orders,
      packing and stock, but not your payment keys.
- [ ] **Products** — upload real photos, confirm they appear on the storefront.
- [ ] **Storefront** — register an account, place a test order end to end.
- [ ] **Orders → To pack** — start packing → packed → shipped, and check your
      name lands in the history sidebar.

---

## If something still fails

The frontends now name the problem rather than making you infer it:

| Message | Cause |
|---|---|
| "Can't reach the API" | `API_URL` wrong, or backend down |
| "pointed at its own web address" | `API_URL` is the storefront's own domain |
| "The database has no tables yet" | Run `npm run db:push` on the backend |
| "No staff account exists yet" | Restart the backend; it creates one and logs it |
| "Invalid email or password" | The account exists — this really is the password |

Backend shell commands:

```bash
npm run whoami        # which staff accounts exist (no hashes printed)
ADMIN_EMAIL=you@enzipackaging.co.ke \
  ADMIN_PASSWORD='choose-something-strong' npm run reset-admin
```

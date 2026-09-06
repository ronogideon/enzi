# Deploy checklist — Enzi v0.2.3

No schema change. Redeploy all three services.

---

## Why you only saw M-Pesa

The tile code for both gateways was already correct in v0.2.2 — so what you were
looking at was almost certainly an **older admin build still deployed**, or your
browser serving a cached bundle. The admin is a compiled bundle; until the new
build actually ships and the page is hard-refreshed, you see the previous layout.

Two things in this release make that impossible to be confused by again:

1. **A version stamp** now shows at the bottom of the admin sidebar (e.g.
   `v0.2.3`). After redeploying, glance there — if it doesn't say `0.2.3`, the
   new build hasn't gone live yet and you're looking at an old one.
2. **Payments is now genuinely tiles with switches**, matching what you asked
   for.

### After deploying

1. Wait for the Railway **admin** service to finish redeploying.
2. Open the dashboard and **hard-refresh** (Ctrl/Cmd + Shift + R).
3. Check the sidebar footer reads `v0.2.3`.
4. Go to **Settings → Payments**.

---

## Payments: two tiles, each with a switch

You'll now see **M-Pesa** and **Kopo Kopo** side by side as tiles. Each shows:

- A status badge — **active** (green), **ready**, or **not set up**.
- A blurb of what it is.
- An **on/off switch**.

Only one is active at a time, because only one can process a given checkout —
turning one on turns the other off. The active method's switch is on and locked,
so you can't accidentally leave the shop with no way to take money.

To enable Kopo Kopo:

1. Tap the **Kopo Kopo** tile — its credential fields load below.
2. Enter Client ID, Client secret and Till number (Kopo Kopo shows **ready**
   once those three are in).
3. **Test Kopo Kopo connection.**
4. Flip its switch on. It becomes **active**; M-Pesa drops to **ready**.

A tile that isn't configured shows **not set up** and its switch stays disabled
until you fill in its details — that's the guard against switching to a gateway
that can't actually charge.

---

## Redeploy

Backend, admin, storefront. No Railway variables, no `db:push`.

---

## Worth checking

- [ ] Sidebar footer shows `v0.2.3` (proves the new build is live).
- [ ] **Settings → Payments** shows two tiles, not one form.
- [ ] Kopo Kopo tile shows **not set up** until you enter its three required
      fields, then **ready**, then **active** once you flip its switch.

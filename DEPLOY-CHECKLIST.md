# Deploy checklist — Enzi v0.2.4

No schema change. Redeploy admin (backend and storefront unchanged, but no harm
redeploying them).

---

## This was my bug — here's what happened

Your screenshot showed v0.2.4's predecessor running correctly (the version stamp
read v0.2.3), but still showing only the M-Pesa form. That was right: when I
rebuilt the payments tile component in the last releases, I never actually
**wired the Payments tab to use it** — the tab kept rendering the old single
M-Pesa form directly. The new component existed but nothing called it.

Fixed. The proof: the string "Kopo Kopo" is now compiled into the admin bundle,
which it demonstrably wasn't before.

---

## What Payments looks like now

Exactly what you asked for — **a list, opening an expanded setup page:**

1. **Settings → Payments** shows a list of payment methods:
   - **M-Pesa (Daraja)**
   - **Kopo Kopo**

   Each row shows an icon, its name, a one-line description, and a status badge:
   **active** (green), **ready**, or **not set up**.

2. **Tap a method** → its full setup page opens: all the credential fields, a
   **Test connection** button, and a **Make active** button.

3. **"← All payment methods"** at the top takes you back to the list.

Only one method is active at a time — activating one switches the other off, so
the shop always has a working way to take payment. A method that isn't
configured shows **not set up**, and its **Make active** button stays disabled
until you've filled in and saved its required fields.

### To turn on Kopo Kopo

1. Payments → tap **Kopo Kopo**.
2. Enter Client ID, Client secret, Till number (and the API key + callback URL
   for live use).
3. **Test Kopo Kopo connection.**
4. **Make active.** It becomes active; M-Pesa drops to "ready" but keeps its
   settings.

---

## After deploying

1. Let the Railway **admin** service finish.
2. Hard-refresh the dashboard (Ctrl/Cmd + Shift + R).
3. Sidebar footer should read **v0.2.4**.
4. **Settings → Payments** is now a two-row list, not a form.

---

## Worth checking

- [ ] Sidebar reads v0.2.4.
- [ ] Payments shows a list of two methods.
- [ ] Tapping Kopo Kopo opens its setup page; the back link returns to the list.
- [ ] Kopo Kopo's "Make active" is disabled until its three required fields are
      saved.

# Deploy checklist — Enzi v0.1.9

There **is** a schema change this time (two payment columns), so push it.

---

## 1. Backend: redeploy, then push the schema

```bash
npm run db:push
```

Adds `Payment.providerRef` and `Payment.receiptRef`. Both nullable — existing
payments and orders are untouched.

## 2. Redeploy storefront and admin

No new Railway variables. Kopo Kopo credentials are entered in the dashboard,
not in Railway.

---

## 3. Turn on Kopo Kopo (optional)

M-Pesa keeps working exactly as it does now — skip this section entirely if
you're happy on Daraja.

**Admin → Settings → Kopo Kopo:**

| Field | Where it comes from |
|---|---|
| Till number | Your K2 till |
| Client ID / Client secret | Kopo Kopo dashboard → API keys |
| API key | Same page — used to verify webhooks |
| Callback URL | `https://api.enzipackaging.com/api/payments/kopokopo/callback` |

Then:

1. Set **Kopo Kopo payments** to On, hit **Test Kopo Kopo connection**.
2. Register that same callback URL in the **Kopo Kopo dashboard** — the shop
   can't do this for you, and payments never confirm without it.
3. **Settings → M-Pesa → Gateway** — switch to Kopo Kopo.
4. Place one sandbox order end to end before flipping Environment to
   production.

Do set the **API key**. Without it the webhook still works, but nothing verifies
that a payment confirmation actually came from Kopo Kopo — anyone who learned
the URL could mark orders paid. The backend logs a warning on every unverified
call.

If the gateway you select isn't fully configured, checkout falls back to
whichever one is, so you can't take the shop offline mid-switch.

---

## 4. Write a blog post

**Admin → Blog → New post.** The editor is full-screen with a live preview.

- Toolbar buttons insert formatting — no syntax to learn.
- **Image** uploads a photo straight into the post (resized in your browser
  first, so a phone photo doesn't take a minute).
- **Link** prompts for a URL and wraps whatever you've selected.
- Leave the summary blank and the opening lines are used automatically.
- Posts save as drafts until you tick **Published**.

Answers in **Admin → FAQs** take the same formatting, so you can link to a
product page instead of describing where to find it. Use the up/down arrows to
set the order customers see.

---

## 5. Have a look at the new navigation

The sidebar is grouped into **Shop / Content / Admin** with icons, and the
mobile bottom bar now has icons too. Blog and FAQs live under Content.

---

## Worth checking after deploy

- [ ] Write one test post, publish it, and confirm it renders at
      `enzipackaging.com/blog` with the images and links working.
- [ ] Add two or three real FAQs — delivery times, minimum orders, payment
      methods are the ones customers ask.
- [ ] Confirm **Settings → M-Pesa → Test M-Pesa connection** still passes.
- [ ] Place one live order to confirm the gateway you've selected is the one
      that runs.

# Deploy checklist — Enzi v0.4.2

No schema change. Redeploy the **storefront** (backend and admin are unchanged
apart from the version stamp).

---

## Footer socials are now real links

They were placeholder letters in circles — "I", "T", "W" — that looked like
buttons but weren't links at all. The footer now uses the same
settings-driven brand icons as the side rail: Instagram, Facebook, TikTok, X,
LinkedIn, YouTube and WhatsApp, each clickable, each opening in a new tab.

Same rule as the rail: **a blank field in Admin → Settings → Social links hides
that icon**, so you only ever show profiles you actually run.

## Sitemap is linked in the footer

Two places:

- **Company column** → "Sitemap"
- **Bottom bar**, alongside Privacy Policy and Terms

Both point at `/sitemap.xml`. Search engines find it through `robots.txt`
regardless, but a visible link is what people and some crawlers look for.

## Also in the footer

- **Delivery & charges** now appears under Shop — it was missing, which meant
  the new delivery page was only reachable from the FAQs and the top nav.
- Your **phone, email and address** are pulled from Settings and shown, with
  the phone and email clickable (tap to call, tap to email on mobile).
- The shop name in the footer comes from Settings rather than being hardcoded.

## One thing I fixed anyway

You said not to worry about the social URL 404s, and entering full URLs does
solve it. But it was a one-line change, so links now work **whether or not you
include `https://`** — a value like `instagram.com/enzipackaging` is upgraded
automatically instead of resolving to
`enzipackaging.com/instagram.com/enzipackaging`.

Worth having because the failure is silent: whoever edits these next won't hit
the same trap, and nothing tells you it's broken except a customer finding a
404.

---

## Worth checking

- [ ] Footer social icons appear and each opens the right profile in a new tab.
- [ ] Clear one social link in Settings → its icon disappears from both the
      footer and the side rail.
- [ ] Footer "Sitemap" link opens `/sitemap.xml`.
- [ ] Footer shows your real phone/email/address from Settings.

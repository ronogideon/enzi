# Deploy checklist — Enzi v0.4.0

No schema change. Redeploy all three.

---

## 1. Delivery information page

New page at **/delivery**, linked from the FAQs page (a prominent card at the
top) and from the main navigation.

It's built from your **live delivery methods and zones** — the same data
checkout uses — so the charges shown can never drift from what customers are
actually billed. That's the usual failure of a hand-written delivery page.

Nothing to configure: whatever you set up in **Admin → Delivery** appears here,
grouped by method with each area and its price, including any "free over X"
thresholds.

## 2. Social links (Admin → Settings → Social links)

Add your profile URLs for Instagram, Facebook, TikTok, X, LinkedIn, YouTube, and
your WhatsApp number. Each shows as its **brand icon** on the shop — replacing
the "IG / TT / WA" text placeholders.

**A blank field hides that icon entirely**, so you'll never link to a profile you
don't run. Add only what you actually use.

## 3. SEO & Analytics (Admin → Settings → SEO & Analytics)

| Field | What to put |
|---|---|
| Site address | `https://enzipackaging.com` |
| Default meta description | Your 150–160 character shop summary |
| Google Analytics ID | `G-XXXXXXXXXX` from GA4 → Admin → Data streams |
| Meta Pixel ID | Optional, for Facebook/Instagram ads |

**Analytics only loads when an ID is set** — a blank field ships no tracking
script at all, so you're not slowing visitors down for data you're not
collecting.

### What's now live for search

- **`/sitemap.xml`** — generated from live data, so every product, category and
  blog post is discoverable automatically. Nothing to maintain by hand.
- **`/robots.txt`** — points at the sitemap and blocks cart, checkout, account
  and order pages, which can never rank and would waste crawl budget.
- **`/llms.txt`** — tells AI assistants what your shop is, your categories, and
  your FAQs in plain text. When someone asks an assistant where to buy packaging
  in Nairobi, this is what gets you quoted accurately.
- **Meta descriptions on every page**, written for search results rather than
  restating the title.

Once deployed, submit `https://enzipackaging.com/sitemap.xml` in **Google Search
Console** — that's the step that actually gets you indexed quickly.

## 4. Alt text on images

Each product photo now has its **own alt text box** underneath it in the admin
uploader. Describe what's in the photo ("White polymailer bags stacked on a
shelf") — Google indexes this for image search, and it's what visually impaired
customers hear.

Existing photos fall back to the product name, so nothing is unlabelled; but
filling these in is the single highest-value SEO task on your list.

## 5. Smaller images, progressive loading

- Photos now compress to **WebP** where supported — typically 25–35% smaller
  than JPEG at the same visual quality — and step down in quality until they're
  under ~300 KB. Max edge reduced to 1400px.
- Quality floor is 0.55, so they never go muddy; packaging photos have flat
  colours that show artefacts early, and this stops well short of that.
- Images **lazy-load** as you scroll, so a long product grid only fetches what's
  near the viewport.

This matters twice over: your photos live in Postgres, and page speed is a
ranking factor.

## 6. Editable quantities

The quantity control on the **cart** and **product page** is now a real input —
type `250` instead of tapping + two hundred and fifty times. The buttons still
work for small adjustments, and the price updates as you type.

---

## Worth checking

- [ ] **/delivery** shows your real methods and zone prices.
- [ ] FAQs page has the delivery card at the top, and it links through.
- [ ] Add one social link → its brand icon appears on the shop; clear it → gone.
- [ ] Visit `/sitemap.xml`, `/robots.txt` and `/llms.txt` — all three should
      return content.
- [ ] Upload a product photo and add alt text; confirm it saves.
- [ ] On the cart, type a quantity directly into the box.

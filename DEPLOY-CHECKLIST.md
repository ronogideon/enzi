# Deploy checklist — Enzi v0.2.0

Schema change again (delivery zones, category descriptions), so push it.

---

## 1. Backend: redeploy, then push the schema

```bash
npm run db:push
```

Adds the `DeliveryZone` table, `Order.deliveryZoneId` and
`Category.description`. All additive — existing methods, orders and categories
are untouched.

## 2. Redeploy admin and storefront

No new Railway variables required.

---

## 3. Your API keys get encrypted automatically

Payment credentials were stored as plain text. They're now encrypted with
AES-256-GCM before they reach the database, and a startup pass encrypts anything
already saved. You'll see this in the backend log:

```
[enzi] Encrypted 4 stored credential(s) at rest.
```

Nothing to do — no re-entering keys.

One thing to know: the encryption key is derived from `JWT_SECRET` unless you set
`SETTINGS_KEY`. **If you ever change `JWT_SECRET`, the saved payment keys stop
decrypting** and read as unset — the gateway refuses to charge rather than
sending garbage to Safaricom, and you'd re-enter them in Settings. To decouple
the two, set `SETTINGS_KEY` to its own random value now, before you have reason
to rotate anything.

---

## 4. Create your categories

**Admin → Categories** (under Shop in the sidebar). Add the groups customers
browse by — Mailers, Boxes, Tape, Ribbons. Reorder with the arrows; that's the
order they appear in the shop menu.

You can also create one without leaving the product form: the category dropdown
now has **+ New category…** at the bottom, which creates and selects it inline.

Deleting a category leaves its products in the shop, just uncategorised. The
confirmation tells you how many are affected first.

---

## 5. Set up delivery zones

**Admin → Delivery.** Each method other than store pickup can now have priced
areas. Open a method and use **Add area**:

| Field | Example |
|---|---|
| Area name | Nairobi CBD |
| Note | Same day, delivered by 6pm |
| Delivery cost | 200 |
| Free over | 5000 (optional) |

Once a method has areas, customers **must** pick one at checkout, and the area's
price replaces the method's flat fee. A method with no areas keeps charging its
flat cost exactly as it does now — so nothing breaks until you add zones.

Store pickup can't have zones; the customer comes to you.

---

## 6. Payments is now one tab

**Admin → Settings → Payments.** M-Pesa and Kopo Kopo are combined, because only
one takes money at a time. The flow is:

1. Select the provider.
2. Enter its credentials.
3. **Test the connection.**
4. **Make it live.**

The button to switch stays disabled until the required credentials are filled in,
and if the one you pick isn't fully configured checkout falls back to whichever
is — you can't take the shop offline mid-switch.

The Settings tabs now have icons and sit on a single divider line.

---

## Worth checking after deploy

- [ ] Backend log shows the credentials were encrypted.
- [ ] **Settings → Payments → Test connection** still passes on your live gateway.
- [ ] Create two or three categories, assign a product to one, and confirm it
      appears under that heading in the shop.
- [ ] Add one delivery zone, then place a test order and confirm the fee that
      appears at checkout matches the order total in the admin.

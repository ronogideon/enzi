# Deploy checklist — Enzi v0.2.2

No schema change. Just redeploy all three services.

---

## Payments: both gateways now shown together

**Settings → Payments** lists M-Pesa and Kopo Kopo as two cards, always both
visible:

- The live one is marked **live now** (green).
- A configured-but-not-live one shows **ready**.
- An unconfigured one shows **not set up**.

Each card carries its own **Make … live** button, so switching is always one tap
— it no longer depends on first selecting the other gateway. Tap a card to load
its credentials below; fill them in, test, then make it live. The switch button
stays disabled until that gateway's required fields are filled.

> If you previously saw only Daraja: that was the v0.1.9 layout plus a bug where
> Kopo Kopo defaulted to disabled. Both are fixed. If Kopo Kopo still shows "not
> set up", enter its Client ID, Client secret and Till number and it becomes
> selectable.

---

## Delivery areas

Three changes, all on **Delivery** (admin) and checkout (storefront):

1. **Alphabetical.** Areas now list A–Z everywhere, not in the order you added
   them — so a long list stays findable.
2. **Search.** On checkout, once a method has more than six areas, a search box
   appears next to "Which area?" so customers can type "Westl…" instead of
   scrolling.
3. **Delivery instructions.** Every delivery/parcel/agent method now has an
   optional free-text field at checkout — exact building, landmark, gate code,
   or an alternative phone number. It shows up highlighted in the order's
   Delivery panel in the admin, so whoever packs and sends it sees it.

Nothing to configure — these are live as soon as you deploy.

---

## Redeploy

1. **Backend** — redeploy.
2. **Admin** — redeploy.
3. **Storefront** — redeploy.

No Railway variables, no `db:push`.

---

## Worth checking

- [ ] **Settings → Payments** shows both gateways; the live one is badged, and
      the other has a working "Make … live" button.
- [ ] Add a 7th area to a delivery method, then on checkout confirm the search
      box appears and filters.
- [ ] Place a test order with a delivery instruction and confirm it appears,
      highlighted, in the order's Delivery panel in the admin.

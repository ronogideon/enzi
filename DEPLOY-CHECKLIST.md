# Deploy checklist — Enzi v0.2.1

---

## First: that P2021 error

**`P2021` means "this table doesn't exist in the database."** The code was
deployed but the schema wasn't updated, so the API is asking for the
`DeliveryZone` table that v0.2.0 added and Postgres has never heard of it.

Fix, in the backend's Railway shell:

```bash
npm run db:push
```

That's the whole fix, and it clears every page showing it. From this release the
error message says so directly instead of showing you a code.

The same applies to `P2022` (a missing *column*) — same cause, same fix.

**This is the step to run after any release that changes the schema.** If a page
that worked yesterday starts failing right after a deploy, this is the first
thing to check.

---

## Why you only saw Daraja

Two reasons, one of them a real bug:

1. In v0.1.9 Kopo Kopo was a separate tab. In v0.2.0 both are merged into one
   **Payments** tab where you pick a provider. If you hadn't deployed v0.2.0
   yet, you were looking at the older layout.
2. **The bug:** `kopokopo.enabled` defaulted to `false`, and the merged UI
   removed the toggle that set it. So even selecting Kopo Kopo would have left
   checkout falling back to M-Pesa, silently. Selecting a provider is now what
   enables it — there's no second hidden switch that can veto your choice.

After deploying, **Settings → Payments** shows both as radio options with
"live" / "configured" / "not set up" badges.

---

## Deploy steps

1. **Backend** — redeploy, then `npm run db:push`.
2. **Admin and storefront** — redeploy. No new Railway variables needed.

---

## Set up Talk Sasa

**Settings → SMS.** Africa's Talking is replaced by Talk Sasa.

| Field | Value |
|---|---|
| API token | From your Talk Sasa dashboard |
| Sender ID | e.g. `ENZI` |
| API base URL | `https://bulksms.talksasa.com/api/v3` (leave as-is) |

Hit **Test SMS connection** — it reads your credit balance back.

**Register the sender ID with Talk Sasa first.** An unregistered sender is the
commonest reason messages silently never arrive, with no error anywhere.

Your old `AT_*` Railway variables are still read as a fallback, so nothing stops
sending in the meantime. You can delete them once Talk Sasa is saved and tested.

---

## Sessions are now split

| | Lifetime | Idle sign-out |
|---|---|---|
| Admin / staff | 8 hours | 30 minutes |
| Customer | 90 days | none |

The admin warns two minutes before signing you out so you don't lose a
half-typed product, and the login page tells you why it happened.

Override with `STAFF_SESSION_TTL` / `CUSTOMER_SESSION_TTL` if 8 hours doesn't
match how your shop works — but leave the idle timeout alone if the dashboard is
ever open on a shared counter machine.

---

## Worth checking

- [ ] Delivery, Categories and any other failing page load after `db:push`.
- [ ] **Settings → Payments** shows Kopo Kopo alongside M-Pesa.
- [ ] **Settings → SMS → Test connection** returns your Talk Sasa balance.
- [ ] Send one test SMS to your own number and confirm it arrives from the
      right sender ID.

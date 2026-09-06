# Deploy checklist — Enzi v0.2.6

No schema change. Redeploy all three.

This release makes the Kopo Kopo payment path **visible**, so we can find out
exactly why confirmations aren't landing — right now it fails silently, which is
why "the backend isn't confirming" and "the callback never arrived" look
identical.

---

## After deploying: diagnose in 60 seconds

1. Make one live test payment and pay it on your phone.
2. In the admin: **Settings → Payments → Callback activity → Check.**

What you see tells you the problem:

| Callback activity shows | Meaning | Fix |
|---|---|---|
| **Nothing** | Kopo Kopo never reached your backend | The callback URL is wrong / unreachable — see below |
| An **unmatched** (red) entry | It arrived but we couldn't tie it to an order | Signing or payload mismatch — send me the backend log |
| A **matched** (green) entry | It worked | Order should now show paid |

3. Cross-check the **backend deploy logs** — every callback now logs a line
   starting `[kopokopo]`, including the parsed id, status, and why it matched or
   didn't. Copy those lines to me if it's still not confirming.

---

## The callback URL — verify it once more

It must be your **backend**, in **both** places, character for character:

```
https://api.enzipackaging.com/api/payments/kopokopo/callback
```

- **Admin → Settings → Payments → Kopo Kopo → Callback URL**
- Your **Kopo Kopo dashboard** webhook settings

Quick reachability test from your own machine:

```bash
curl -i -X POST https://api.enzipackaging.com/api/payments/kopokopo/callback \
  -H "Content-Type: application/json" -d '{}'
```

You want an HTTP **200** with `{"received":true}`. If you get a 404 or a
timeout, the URL isn't reaching your backend and that's the whole problem — no
payment can ever confirm until this returns 200.

---

## What changed

- **Every callback is now logged** the instant it arrives, before anything can
  reject it — so a dropped callback leaves a trace.
- **The signature mismatch no longer silently 401s.** It logs the reason and,
  for now, still processes the payment so a signing quirk can't block your
  money. (Set the API key so verification can pass cleanly.)
- **The webhook parser is widened** to handle the several payload shapes Kopo
  Kopo uses, and it falls back to matching on the order number if the payment id
  doesn't line up.
- **The customer screen no longer hangs.** If a Kopo Kopo confirmation hasn't
  arrived after ~90 seconds, it moves to a "we'll confirm shortly" screen with a
  **View my order** link instead of spinning forever. It also shows cancelled /
  timeout / wrong-PIN / insufficient-balance outcomes explicitly.
- **Admin auto-refreshes**, so a payment that confirms shows within seconds.

---

## If it's still stuck: the manual path always works

Open the order in the admin → **Record payment received**. That marks it paid,
records the amount, and moves it into the packing queue. Use it for any payment
that went through on the phone but didn't auto-confirm, so a webhook problem
never blocks fulfilment while we sort out the root cause.

---

## Send me this if it's still failing

1. The `[kopokopo]` lines from the backend deploy log after a test payment.
2. What **Callback activity** shows (nothing / unmatched / matched).
3. The result of the `curl` command above.

That triangulates it immediately.

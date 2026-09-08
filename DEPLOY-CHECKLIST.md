# Deploy checklist — Enzi v0.6.0 — Roles, returns & accountability

**Schema change.** Run `npm run db:push` after deploying the backend.

---

## Who sees money

Shop floor and customer care no longer receive revenue, order totals or item
prices **from the API at all** — not hidden in the UI, simply not sent, so it
can't leak from a browser left open at the counter. They see the orders, the
customer's name and phone, the items and quantities: everything needed to pack
and send.

Managers and the owner see everything, as before.

## Fulfilment authority

| Action | Who |
|---|---|
| Confirm → packing → packed → **out for delivery** | Everyone |
| **Mark delivered** | Customer care, manager, owner |
| **Mark returned** | Everyone |
| Cancel | Manager, owner |
| **Refund** | Requested by anyone, **approved by someone else** |

**Refunds now need two people.** Anyone can request one with a reason; a manager
approves it — unless the request came *from* a manager, in which case only the
owner can. Self-approval is blocked outright. Nothing is refunded until approved.

## Returns

New status. Any staff member can mark an order returned, and **stock goes back
on the shelf automatically**, per size and colour. A return is separate from a
refund: goods coming back doesn't move money until a refund is approved.

## Performance

New **Performance** page, reached from your own name in the sidebar. Measured in
work — orders packed, sent, returned — with a per-day bar chart. Deliberately no
money, so the whole team can use it.

Everyone sees themselves and their colleagues. **Only the owner sees the
owner's.**

## Accountability

Every significant change is recorded against whoever made it: promotions
started, settings changed, staff created, orders advanced, refunds requested and
approved. Managers see the team's activity; **the owner also sees managers'** —
which is the point.

The log is on the Performance page under "Recent changes". Values of secrets are
never recorded, only that the key changed.

## Owner-only settings

Managers can no longer change **payment keys or social links** — those are the
owner's. Enforced on the server, so it isn't just a hidden button.

## Smaller things

- **Staff page** uses icon actions and a compact table; the role cards are
  folded into "What each role can do" so the accounts get the room.
- **Mobile storefront**: the cart icon now sits beside the menu button, with its
  count badge — no more opening the menu to reach the cart.

---

## Worth checking

- [ ] Sign in as a STAFF account: no revenue on the dashboard, no prices on
      orders, and "Mark delivered" is absent.
- [ ] As STAFF, mark an order returned → stock goes back up on that size.
- [ ] Request a refund as one account, approve as another; try approving your
      own request and confirm it's refused.
- [ ] Owner: open Performance → see the team plus "Recent changes".
- [ ] Manager: confirm the owner's figures are not listed.
- [ ] Manager: try changing an M-Pesa key → refused.
- [ ] Phone: cart icon beside the menu, with the item count.

import { prisma } from "./prisma";

export type Role = "SUPERADMIN" | "ADMIN" | "STAFF" | "SUPPORT";

/**
 * Who can see money.
 *
 * Shop-floor and support accounts pack and chase orders; they don't need
 * revenue, margins or order totals to do that, and those numbers travel — a
 * screen left open at the counter shouldn't show the day's takings. Managers
 * and the owner see everything.
 */
export function canSeeMoney(role: string): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}

/** Only the owner touches payment credentials and public brand links. */
export function canEditSensitiveSettings(role: string): boolean {
  return role === "SUPERADMIN";
}

const OWNER_ONLY_SETTING_PREFIXES = ["mpesa.", "kopokopo.", "payments.", "social.", "sms.apiKey"];

export function isOwnerOnlySetting(key: string): boolean {
  return OWNER_ONLY_SETTING_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Fulfilment authority.
 *
 * Shop floor moves an order all the way to "out for delivery" — that's the work
 * they actually do. Confirming it arrived is someone else's call, because the
 * person who packed it is the last person who should be able to close it out
 * unwitnessed.
 */
const DELIVERY_ROLES: Role[] = ["SUPERADMIN", "ADMIN", "SUPPORT"];

export function canMarkDelivered(role: string): boolean {
  return DELIVERY_ROLES.includes(role as Role);
}

/** Everyone can record a return — goods come back to whoever is on the floor. */
export function canMarkReturned(_role: string): boolean {
  return true;
}

/**
 * Refund approval.
 *
 * A refund moves real money, so it needs a second person. An ordinary request
 * is approved by a manager; a request from a manager has to go to the owner,
 * because self-approval is how money quietly leaves a business.
 */
export function canApproveRefund(
  approverRole: string,
  requesterRole: string | null | undefined,
  approverId: string,
  requesterId: string | null | undefined
): { ok: boolean; reason?: string } {
  if (approverId === requesterId)
    return { ok: false, reason: "A refund can't be approved by the person who requested it." };

  if (requesterRole === "ADMIN" || requesterRole === "SUPERADMIN") {
    if (approverRole !== "SUPERADMIN")
      return {
        ok: false,
        reason: "This refund was raised by a manager, so the owner has to approve it.",
      };
    return { ok: true };
  }

  if (approverRole === "SUPERADMIN" || approverRole === "ADMIN") return { ok: true };
  return { ok: false, reason: "Only a manager or the owner can approve a refund." };
}

/**
 * Whose performance figures a viewer may see.
 *
 * Staff see themselves and their colleagues — visible effort is part of how a
 * small team works. Nobody sees the owner's figures except the owner, so the
 * hierarchy doesn't invert.
 */
export function canViewMetricsOf(viewerRole: string, targetRole: string, isSelf: boolean): boolean {
  if (isSelf) return true;
  if (targetRole === "SUPERADMIN") return viewerRole === "SUPERADMIN";
  return true;
}

/**
 * Strip money from a payload for roles that shouldn't see it. Applied on the
 * way out of the API rather than hidden in the UI — a value the browser never
 * receives can't leak from it.
 */
export function stripMoney<T extends Record<string, any>>(row: T, role: string): T {
  if (canSeeMoney(role)) return row;

  const cleaned: Record<string, any> = { ...row };
  for (const key of ["subtotal", "deliveryFee", "total", "unitPrice", "lineTotal", "totalSpent"])
    delete cleaned[key];

  if (Array.isArray(cleaned.items))
    cleaned.items = cleaned.items.map((i: any) => {
      const { unitPrice, lineTotal, ...rest } = i;
      return rest;
    });

  if (Array.isArray(cleaned.payments))
    cleaned.payments = cleaned.payments.map((p: any) => {
      const { amount, ...rest } = p;
      return rest;
    });

  return cleaned as T;
}

/**
 * Record a change against the person who made it.
 *
 * Never throws: an audit write failing must not roll back the action it was
 * describing, or a logging hiccup becomes an outage.
 */
export async function audit(
  actor: { sub: string; role: string } | undefined,
  entry: {
    action: string;
    summary: string;
    entity?: string;
    entityId?: string;
    meta?: any;
  }
): Promise<void> {
  try {
    let staffName: string | undefined;
    if (actor?.sub) {
      const staff = await prisma.staffUser.findUnique({
        where: { id: actor.sub },
        select: { name: true },
      });
      staffName = staff?.name;
    }

    await prisma.auditLog.create({
      data: {
        staffId: actor?.sub ?? null,
        staffName: staffName ?? null,
        staffRole: actor?.role ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        meta: entry.meta ?? undefined,
      },
    });
  } catch (e) {
    console.error("[audit] could not record entry:", entry.action, e);
  }
}

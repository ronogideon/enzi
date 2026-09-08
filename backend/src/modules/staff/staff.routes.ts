import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { HttpError } from "../../middleware/error";
import { requireStaff, requireRole } from "../../middleware/auth";
import { normalizePhone } from "../../lib/phone";
import { canViewMetricsOf, audit } from "../../lib/permissions";

export const staffRouter = Router();

/**
 * Performance figures.
 *
 * Deliberately about work done, not money taken: orders packed, dispatched and
 * returned. That's what a shop-floor account controls, and it means the metrics
 * screen carries nothing a non-manager shouldn't see.
 */
async function metricsFor(staffId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [packed, dispatched, events] = await Promise.all([
    prisma.order.count({ where: { packedById: staffId, packedAt: { gte: since } } }),
    prisma.orderEvent.count({
      where: { staffId, toStatus: "DISPATCHED", createdAt: { gte: since } },
    }),
    prisma.orderEvent.findMany({
      where: { staffId, createdAt: { gte: since } },
      select: { toStatus: true, createdAt: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const e of events) if (e.toStatus) byStatus[e.toStatus] = (byStatus[e.toStatus] ?? 0) + 1;

  // Activity per day, so a quiet week is visible as a shape rather than a
  // single number that hides it.
  const daily = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    daily.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of events) {
    const key = e.createdAt.toISOString().slice(0, 10);
    if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
  }

  return {
    days,
    packed,
    dispatched,
    returned: byStatus.RETURNED ?? 0,
    delivered: byStatus.DELIVERED ?? 0,
    actions: events.length,
    daily: [...daily.entries()].map(([date, count]) => ({ date, count })),
  };
}

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

// Never select passwordHash — it must not leave the database.
const SAFE = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const ROLES = ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] as const;

/**
 * Role model, in plain terms:
 *   SUPERADMIN — everything, including managing other admins.
 *   ADMIN      — everything day-to-day: products, promos, settings, staff.
 *   STAFF      — the shop floor: orders, packing, products, stock. No settings,
 *                no customer contact details, no marketing spend.
 *   SUPPORT    — orders and customers, read-mostly. For anyone answering calls.
 */

staffRouter.get(
  "/",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (_req, res) => {
    res.json(
      await prisma.staffUser.findMany({
        select: { ...SAFE, _count: { select: { packedOrders: true } } },
        orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      })
    );
  })
);

/**
 * The activity log. Managers see the team's changes; the owner additionally
 * sees managers' — which is the point of recording them.
 */
staffRouter.get(
  "/activity",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const take = Math.min(parseInt(String(req.query.take ?? "60"), 10) || 60, 200);
    const viewerRole = req.auth!.role;

    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: { staff: { select: { id: true, name: true, role: true } } },
    });

    // A manager shouldn't be reading the owner's actions.
    const visible =
      viewerRole === "SUPERADMIN"
        ? entries
        : entries.filter((e) => e.staffRole !== "SUPERADMIN");

    res.json(visible);
  })
);

/** Whoever is holding this token — used by the admin app on boot. */
staffRouter.get(
  "/me",
  requireStaff,
  wrap(async (req, res) => {
    const me = await prisma.staffUser.findUnique({
      where: { id: req.auth!.sub },
      select: SAFE,
    });
    if (!me || !me.active) throw new HttpError(401, "Account is no longer active");
    res.json(me);
  })
);

/**
 * Metrics for the team. Everyone sees themselves and their colleagues; only
 * the owner sees the owner's, so the hierarchy doesn't invert.
 */
staffRouter.get(
  "/metrics",
  requireStaff,
  wrap(async (req, res) => {
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 7), 90);
    const viewerRole = req.auth!.role;

    const team = await prisma.staffUser.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    const visible = team.filter((t) =>
      canViewMetricsOf(viewerRole, t.role, t.id === req.auth!.sub)
    );

    const rows = await Promise.all(
      visible.map(async (t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        isSelf: t.id === req.auth!.sub,
        ...(await metricsFor(t.id, days)),
      }))
    );

    res.json({ days, staff: rows });
  })
);

/** Change your own password. Any staff member, no admin needed. */
staffRouter.post(
  "/me/password",
  requireStaff,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(8) })
      .parse(req.body);

    const me = await prisma.staffUser.findUnique({ where: { id: req.auth!.sub } });
    if (!me) throw new HttpError(404, "Account not found");
    if (!(await verifyPassword(currentPassword, me.passwordHash)))
      throw new HttpError(400, "Current password is incorrect");

    await prisma.staffUser.update({
      where: { id: me.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    });
    res.json({ ok: true });
  })
);

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(ROLES).default("STAFF"),
  password: z.string().min(8),
  mustChangePassword: z.boolean().default(true),
});

staffRouter.post(
  "/",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);

    // Only a SUPERADMIN can mint another SUPERADMIN.
    if (body.role === "SUPERADMIN" && req.auth!.role !== "SUPERADMIN")
      throw new HttpError(403, "Only a superadmin can create another superadmin");

    const email = body.email.toLowerCase().trim();
    const existing = await prisma.staffUser.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "A staff account with that email already exists");

    const staff = await prisma.staffUser.create({
      data: {
        name: body.name.trim(),
        email,
        phone: body.phone ? normalizePhone(body.phone) : null,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        mustChangePassword: body.mustChangePassword,
      },
      select: SAFE,
    });

    await audit(req.auth!, {
      action: "staff.create",
      entity: "staff",
      entityId: staff.id,
      summary: `Created ${body.role} account for ${staff.name} (${staff.email})`,
    });

    res.status(201).json(staff);
  })
);

staffRouter.patch(
  "/:id",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        role: z.enum(ROLES).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);

    const target = await prisma.staffUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, "Staff member not found");

    const isSelf = target.id === req.auth!.sub;

    // You can't lock yourself out or quietly demote yourself.
    if (isSelf && body.active === false)
      throw new HttpError(400, "You can't deactivate your own account");
    if (isSelf && body.role && body.role !== target.role)
      throw new HttpError(400, "You can't change your own role");

    // Only a superadmin touches a superadmin.
    if (target.role === "SUPERADMIN" && req.auth!.role !== "SUPERADMIN")
      throw new HttpError(403, "Only a superadmin can modify a superadmin");
    if (body.role === "SUPERADMIN" && req.auth!.role !== "SUPERADMIN")
      throw new HttpError(403, "Only a superadmin can grant superadmin");

    // Never leave the business with no way back in.
    if (
      target.role === "SUPERADMIN" &&
      (body.active === false || (body.role && body.role !== "SUPERADMIN"))
    ) {
      const others = await prisma.staffUser.count({
        where: { role: "SUPERADMIN", active: true, id: { not: target.id } },
      });
      if (others === 0)
        throw new HttpError(400, "This is the last active superadmin — promote someone else first");
    }

    const staff = await prisma.staffUser.update({
      where: { id: target.id },
      data: {
        name: body.name?.trim(),
        phone: body.phone !== undefined ? (body.phone ? normalizePhone(body.phone) : null) : undefined,
        role: body.role,
        active: body.active,
      },
      select: SAFE,
    });
    res.json(staff);
  })
);

/** Admin-set password reset — hands the employee a temporary password. */
staffRouter.post(
  "/:id/password",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const { password } = z.object({ password: z.string().min(8) }).parse(req.body);
    const target = await prisma.staffUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, "Staff member not found");
    if (target.role === "SUPERADMIN" && req.auth!.role !== "SUPERADMIN")
      throw new HttpError(403, "Only a superadmin can reset a superadmin password");

    await prisma.staffUser.update({
      where: { id: target.id },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: target.id !== req.auth!.sub,
      },
    });
    res.json({ ok: true });
  })
);

/**
 * Deactivate rather than delete when the account has history — an order that
 * says "packed by Jane" should keep saying that after Jane leaves.
 */
staffRouter.delete(
  "/:id",
  requireRole("SUPERADMIN", "ADMIN"),
  wrap(async (req, res) => {
    const target = await prisma.staffUser.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { packedOrders: true, stockAudits: true, smsCampaigns: true } } },
    });
    if (!target) throw new HttpError(404, "Staff member not found");
    if (target.id === req.auth!.sub)
      throw new HttpError(400, "You can't delete your own account");
    if (target.role === "SUPERADMIN" && req.auth!.role !== "SUPERADMIN")
      throw new HttpError(403, "Only a superadmin can remove a superadmin");
    if (target.role === "SUPERADMIN") {
      const others = await prisma.staffUser.count({
        where: { role: "SUPERADMIN", active: true, id: { not: target.id } },
      });
      if (others === 0) throw new HttpError(400, "This is the last active superadmin");
    }

    const hasHistory =
      target._count.packedOrders > 0 ||
      target._count.stockAudits > 0 ||
      target._count.smsCampaigns > 0;

    if (hasHistory) {
      await prisma.staffUser.update({ where: { id: target.id }, data: { active: false } });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.staffUser.delete({ where: { id: target.id } });
    res.json({ ok: true, deleted: true });
  })
);

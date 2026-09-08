import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireStaff } from "../../middleware/auth";
import { canSeeMoney } from "../../lib/permissions";

export const statsRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

statsRouter.get(
  "/overview",
  requireStaff,
  wrap(async (_req: any, res) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      revenueAgg,
      monthRevenueAgg,
      lastMonthRevenueAgg,
      todayRevenueAgg,
      orderCount,
      todayOrders,
      customerCount,
      newCustomersThisMonth,
      accountHolders,
      lowStock,
      statusGroups,
    ] = await Promise.all([
      prisma.order.aggregate({ _sum: { total: true }, where: { isPaid: true } }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { isPaid: true, paidAt: { gte: monthStart } },
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { isPaid: true, paidAt: { gte: lastMonthStart, lt: monthStart } },
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { isPaid: true, paidAt: { gte: dayStart } },
      }),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.customer.count(),
      prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.customer.count({ where: { passwordHash: { not: null } } }),
      prisma.product.findMany({
        where: { active: true, stockQty: { lte: 10 } },
        select: { id: true, name: true, stockQty: true },
        orderBy: { stockQty: "asc" },
        take: 10,
      }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const g of statusGroups) byStatus[g.status] = g._count._all;

    const topItems = await prisma.orderItem.groupBy({
      by: ["productId", "name"],
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    const thisMonth = monthRevenueAgg._sum.total ?? 0;
    const lastMonth = lastMonthRevenueAgg._sum.total ?? 0;

    const showMoney = canSeeMoney(_req.auth!.role);

    // Shop floor and support get the work picture — how many orders, what's
    // waiting to be packed — with none of the takings.
    const money = showMoney
      ? {
          revenueTotal: revenueAgg._sum.total ?? 0,
          revenueThisMonth: thisMonth,
          revenueLastMonth: lastMonth,
          revenueToday: todayRevenueAgg._sum.total ?? 0,
          revenueChangePct:
            lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null,
          topProducts: topItems.map((t) => ({
            productId: t.productId,
            name: t.name,
            unitsSold: t._sum.quantity ?? 0,
            revenue: t._sum.lineTotal ?? 0,
          })),
        }
      : {
          // Units still make sense to the floor; shillings don't.
          topProducts: topItems.map((t) => ({
            productId: t.productId,
            name: t.name,
            unitsSold: t._sum.quantity ?? 0,
            revenue: 0,
          })),
        };

    res.json({
      showMoney,
      ...money,
      _legacy: undefined,
      orders: orderCount,
      ordersToday: todayOrders,
      openOrders:
        (byStatus.PENDING_PAYMENT ?? 0) + (byStatus.CONFIRMED ?? 0) + (byStatus.PROCESSING ?? 0),
      packingQueue: (byStatus.CONFIRMED ?? 0) + (byStatus.PROCESSING ?? 0),
      awaitingDispatch: byStatus.PACKED ?? 0,
      inTransit: byStatus.DISPATCHED ?? 0,
      customers: customerCount,
      newCustomersThisMonth,
      accountHolders,
      byStatus,
      lowStock,
    });
  })
);

/**
 * Revenue by day for the dashboard chart. Zero-fills missing days so the line
 * reads as a genuine dip rather than skipping straight across a quiet week.
 */
statsRouter.get(
  "/revenue-series",
  requireStaff,
  wrap(async (req: any, res) => {
    if (!canSeeMoney(req.auth!.role)) return res.json([]);
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 7), 180);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const orders = await prisma.order.findMany({
      where: { isPaid: true, paidAt: { gte: since } },
      select: { paidAt: true, total: true },
    });

    const byDay = new Map<string, { total: number; orders: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      byDay.set(d.toISOString().slice(0, 10), { total: 0, orders: 0 });
    }
    for (const o of orders) {
      if (!o.paidAt) continue;
      const key = o.paidAt.toISOString().slice(0, 10);
      const row = byDay.get(key);
      if (row) {
        row.total += o.total;
        row.orders += 1;
      }
    }

    res.json(
      [...byDay.entries()].map(([date, v]) => ({
        date,
        total: v.total,
        orders: v.orders,
      }))
    );
  })
);

/** Best sellers over a window — feeds "what should I promote?". */
statsRouter.get(
  "/top-products",
  requireStaff,
  wrap(async (req, res) => {
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const items = await prisma.orderItem.groupBy({
      by: ["productId", "name"],
      where: { order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 20,
    });

    res.json(
      items.map((t) => ({
        productId: t.productId,
        name: t.name,
        unitsSold: t._sum.quantity ?? 0,
        revenue: t._sum.lineTotal ?? 0,
      }))
    );
  })
);

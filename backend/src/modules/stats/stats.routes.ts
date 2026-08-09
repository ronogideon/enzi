import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireStaff } from "../../middleware/auth";

export const statsRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

statsRouter.get(
  "/overview",
  requireStaff,
  wrap(async (_req, res) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      revenueAgg,
      monthRevenueAgg,
      orderCount,
      pendingCount,
      customerCount,
      lowStock,
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { total: true },
        where: { isPaid: true },
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { isPaid: true, paidAt: { gte: monthStart } },
      }),
      prisma.order.count(),
      prisma.order.count({
        where: { status: { in: ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING"] } },
      }),
      prisma.customer.count(),
      prisma.product.findMany({
        where: { active: true, stockQty: { lte: 10 } },
        select: { id: true, name: true, stockQty: true },
        orderBy: { stockQty: "asc" },
        take: 10,
      }),
    ]);

    // top products by units sold (from order items)
    const topItems = await prisma.orderItem.groupBy({
      by: ["productId", "name"],
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    res.json({
      revenueTotal: revenueAgg._sum.total ?? 0,
      revenueThisMonth: monthRevenueAgg._sum.total ?? 0,
      orders: orderCount,
      openOrders: pendingCount,
      customers: customerCount,
      lowStock,
      topProducts: topItems.map((t) => ({
        productId: t.productId,
        name: t.name,
        unitsSold: t._sum.quantity ?? 0,
        revenue: t._sum.lineTotal ?? 0,
      })),
    });
  })
);

// simple revenue-by-day series for a chart (last 30 days)
statsRouter.get(
  "/revenue-series",
  requireStaff,
  wrap(async (_req, res) => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const orders = await prisma.order.findMany({
      where: { isPaid: true, paidAt: { gte: since } },
      select: { paidAt: true, total: true },
    });
    const byDay = new Map<string, number>();
    for (const o of orders) {
      const key = o.paidAt!.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + o.total);
    }
    res.json(
      [...byDay.entries()]
        .sort()
        .map(([date, total]) => ({ date, total }))
    );
  })
);

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { PageHeader, StatCard, Spinner, useAsync, EmptyState, Badge } from "@/components/ui";

export default function Dashboard() {
  const stats = useAsync(() => api.statsOverview(), []);
  const series = useAsync(() => api.revenueSeries(30), []);

  if (stats.loading) return <Spinner label="Loading dashboard…" />;
  if (stats.error) return <EmptyState title="Couldn’t load stats" hint={stats.error} />;
  const s = stats.data!;

  const chartData = (series.data ?? []).map((d) => ({
    date: d.date.slice(5),
    total: Math.round(d.total / 100),
  }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Business at a glance" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Money only renders for roles the API sends it to — the fields are
            simply absent for shop floor and support. */}
        {s.showMoney !== false && (
        <StatCard
          label="Revenue this month"
          value={formatKes(s.revenueThisMonth)}
          sub={
            s.revenueChangePct === null
              ? `${formatKes(s.revenueTotal)} all time`
              : `${s.revenueChangePct >= 0 ? "+" : ""}${s.revenueChangePct}% vs last month`
          }
        />
        )}
        <StatCard
          label="Today"
          value={
            s.showMoney !== false
              ? formatKes(s.revenueToday)
              : `${s.ordersToday} order${s.ordersToday === 1 ? "" : "s"}`
          }
          sub={
            s.showMoney !== false
              ? `${s.ordersToday} order${s.ordersToday === 1 ? "" : "s"} today`
              : "placed today"
          }
        />
        <StatCard
          label="Orders to pack"
          value={String(s.packingQueue)}
          sub={`${s.awaitingDispatch} to ship · ${s.inTransit} on the way`}
        />
        <StatCard
          label="Customers"
          value={String(s.customers)}
          sub={`${s.newCustomersThisMonth} new this month · ${s.accountHolders} with accounts`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* revenue chart */}
        <div className="card p-6 lg:col-span-2">
          <p className="mb-4 font-display font-bold text-white">Revenue · last 30 days</p>
          {chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              No paid orders yet — the chart fills in as sales come through.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B6CF0" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#5B6CF0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="#6B7076" fontSize={12} />
                <YAxis stroke="#6B7076" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#121215",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    color: "#F4F4F5",
                  }}
                  formatter={(v: number) => [`Ksh ${v.toLocaleString()}`, "Revenue"]}
                />
                <Area type="monotone" dataKey="total" stroke="#5B6CF0" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* low stock */}
        <div className="card p-6">
          <p className="mb-4 font-display font-bold text-white">Low stock</p>
          {s.lowStock.length === 0 ? (
            <p className="text-sm text-muted">Everything’s well stocked.</p>
          ) : (
            <ul className="space-y-3">
              {s.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-cloud">{p.name}</span>
                  <Badge tone={p.stockQty <= 3 ? "danger" : "gold"}>{p.stockQty} left</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* top products */}
      <div className="card mt-6 overflow-hidden">
        <p className="border-b border-ink-line px-6 py-4 font-display font-bold text-white">
          Top products
        </p>
        {s.topProducts.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted">No sales data yet.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Product</th>
                <th className="th text-right">Units sold</th>
                <th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {s.topProducts.map((p) => (
                <tr key={p.productId} className="border-b border-ink-line/60 last:border-0">
                  <td className="td">{p.name}</td>
                  <td className="td text-right">{p.unitsSold}</td>
                  <td className="td text-right">{formatKes(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, Spinner, EmptyState, Badge, useAsync } from "@/components/ui";
import { Icon } from "@/components/Icons";

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "Owner",
  ADMIN: "Manager",
  STAFF: "Shop floor",
  SUPPORT: "Customer care",
};

/**
 * Team performance.
 *
 * Measured in work done — orders packed, dispatched, returned — not money
 * taken. That's what a shop-floor account actually controls, and it keeps this
 * screen free of anything a non-manager shouldn't see, so the whole team can
 * use it.
 */
export default function Metrics() {
  const [days, setDays] = useState(30);
  const metrics = useAsync(() => api.staffMetrics(days), [days]);
  const { can } = useAuth();

  const rows = metrics.data?.staff ?? [];
  const me = rows.find((r) => r.isSelf);
  const others = rows.filter((r) => !r.isSelf);

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle="Orders packed and sent, by person"
        action={
          <div className="flex rounded-lg border border-ink-line p-0.5 text-xs">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  days === d ? "bg-ink-hover text-white" : "text-muted"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {metrics.loading ? (
        <Spinner />
      ) : metrics.error ? (
        <EmptyState title="Couldn't load performance" hint={metrics.error} />
      ) : (
        <>
          {me && (
            <div className="mb-6">
              <p className="label">You</p>
              <MetricCard row={me} highlight />
            </div>
          )}

          {others.length > 0 && (
            <>
              <p className="label">The team</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {others.map((r) => (
                  <MetricCard key={r.id} row={r} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {can(["SUPERADMIN", "ADMIN"]) && <ActivityLog />}
    </>
  );
}

function MetricCard({
  row,
  highlight,
}: {
  row: {
    name: string;
    role: string;
    packed: number;
    dispatched: number;
    returned: number;
    delivered: number;
    daily: { date: string; count: number }[];
  };
  highlight?: boolean;
}) {
  const peak = Math.max(1, ...row.daily.map((d) => d.count));

  return (
    <div className={`card p-4 ${highlight ? "border-white/20" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{row.name}</p>
          <p className="text-xs text-faint">{ROLE_LABEL[row.role] ?? row.role}</p>
        </div>
        <Badge tone={highlight ? "indigo" : "muted"}>{row.packed} packed</Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Packed" value={row.packed} />
        <Stat label="Sent" value={row.dispatched} />
        <Stat label="Returns" value={row.returned} />
      </div>

      {/* A bar per day — a quiet week reads as a shape, where a single total
          would hide it. */}
      <div className="mt-4 flex h-8 items-end gap-[2px]">
        {row.daily.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="flex-1 rounded-sm bg-indigo/60"
            style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-ink-800/60 py-2">
      <p className="font-display text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
    </div>
  );
}

/** Who changed what — managers see the team, the owner sees managers too. */
function ActivityLog() {
  const log = useAsync(() => api.activityLog(40), []);

  return (
    <div className="mt-10">
      <p className="label">Recent changes</p>
      {log.loading ? (
        <Spinner />
      ) : (log.data ?? []).length === 0 ? (
        <p className="text-sm text-faint">Nothing recorded yet.</p>
      ) : (
        <div className="card divide-y divide-ink-line/60">
          {(log.data ?? []).map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-800 text-muted">
                <Icon.Edit className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-cloud">{e.summary}</p>
                <p className="text-xs text-faint">
                  {e.staffName ?? "Someone"}
                  {e.staffRole && ` · ${ROLE_LABEL[e.staffRole] ?? e.staffRole}`} ·{" "}
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

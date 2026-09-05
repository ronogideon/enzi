import { useState } from "react";
import { api } from "@/lib/api";
import { formatKes } from "@/lib/money";
import type { Customer } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync,
} from "@/components/ui";
import { Icon } from "@/components/Icons";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const customers = useAsync(() => api.customers({ search: query || undefined }), [query]);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /**
   * Fetched through the API client rather than a plain link so the request
   * carries the auth header — the export endpoint is staff-only.
   */
  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await api.downloadCustomersCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enzi-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone who has ordered — built automatically at checkout"
        action={
          <button className="btn-ghost" onClick={exportCsv} disabled={exporting}>
            <Icon.Download className="h-4 w-4" />
            {exporting ? "Preparing…" : "Export CSV"}
          </button>
        }
      />

      <form
        onSubmit={(e) => { e.preventDefault(); setQuery(search); }}
        className="mb-5 flex gap-2"
      >
        <input
          className="field max-w-xs"
          placeholder="Search name, phone or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-ghost">Search</button>
        {query && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { setSearch(""); setQuery(""); }}
          >
            Clear
          </button>
        )}
      </form>

      {customers.loading ? (
        <Spinner />
      ) : customers.error ? (
        <EmptyState title="Couldn’t load customers" hint={customers.error} />
      ) : customers.data!.length === 0 ? (
        <EmptyState title="No customers found" />
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {customers.data!.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className="rec w-full text-left transition-colors active:bg-ink-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{c.name ?? "—"}</p>
                  <p className="text-xs text-muted">+{c.phone}</p>
                  {c.email && <p className="truncate text-xs text-faint">{c.email}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm text-cloud">{formatKes(c.totalSpent)}</p>
                  <p className="text-xs text-faint">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {(c.hasAccount || c.tags.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.hasAccount && <Badge tone="muted">has account</Badge>}
                  {c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Customer</th>
                <th className="th">Contact</th>
                <th className="th text-right">Orders</th>
                <th className="th text-right">Spent</th>
                <th className="th">Tags</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {customers.data!.map((c) => (
                <tr key={c.id} className="border-b border-ink-line/60 last:border-0">
                  <td className="td">
                    <p className="font-medium text-white">{c.name ?? "—"}</p>
                    {c.hasAccount && (
                      <span className="text-[11px] text-faint">has an account</span>
                    )}
                  </td>
                  <td className="td text-muted">
                    <a href={`tel:+${c.phone}`} className="hover:text-cloud">+{c.phone}</a>
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="block break-all text-xs text-faint hover:text-cloud"
                      >
                        {c.email}
                      </a>
                    )}
                  </td>
                  <td className="td text-right">{c.orderCount}</td>
                  <td className="td text-right">{formatKes(c.totalSpent)}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </td>
                  <td className="td text-right">
                    <button className="text-sm text-indigo hover:underline" onClick={() => setSelected(c.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {selected && (
        <CustomerModal
          id={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); customers.reload(); }}
        />
      )}
    </>
  );
}

function CustomerModal({
  id, onClose, onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, loading } = useAsync<Customer>(() => api.customer(id), [id]);
  const [tags, setTags] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (data && !seeded) {
    setTags(data.tags.join(", "));
    setNotes(data.notes ?? "");
    setEmail(data.email ?? "");
    setConsent(data.marketingConsent);
    setSeeded(true);
  }

  async function save() {
    setBusy(true);
    try {
      await api.updateCustomer(id, {
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: notes || undefined,
        email: email.trim(),
        marketingConsent: consent,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={data?.name ?? data?.phone ?? "Customer"} onClose={onClose} wide>
      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Phone" value={`+${data.phone}`} />
            <Stat label="Orders" value={String(data.orderCount)} />
            <Stat label="Spent" value={formatKes(data.totalSpent)} />
            <Stat label="Last order" value={data.lastOrderAt ? new Date(data.lastOrderAt).toLocaleDateString() : "—"} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Email</label>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="not provided"
              />
            </div>
            <div>
              <label className="label">Tags (comma separated)</label>
              <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, wholesale" />
            </div>
            <div className="flex items-end gap-3">
              <Toggle checked={consent} onChange={setConsent} />
              <span className="pb-2 text-sm text-cloud">Marketing consent</span>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {data.orders && data.orders.length > 0 && (
            <div className="mt-6">
              <p className="label">Recent orders</p>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {data.orders.slice(0, 8).map((o) => (
                      <tr key={o.id} className="border-b border-ink-line/60 last:border-0">
                        <td className="td">{o.orderNumber}</td>
                        <td className="td text-muted">{o.status.toLowerCase()}</td>
                        <td className="td text-right">{formatKes(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button className="btn-ghost" onClick={onClose}>Close</button>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

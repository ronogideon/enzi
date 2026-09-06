import { useState } from "react";
import { api } from "@/lib/api";
import { formatKes, kesToCents, centsToKes } from "@/lib/money";
import type { DeliveryMethod, DeliveryZone } from "@/lib/types";
import { PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync } from "@/components/ui";
import { Icon } from "@/components/Icons";

const TYPE_LABEL: Record<string, string> = {
  STORE_PICKUP: "Store pickup",
  DELIVERY: "Delivery",
  PARCEL: "Parcel / courier",
  PICKUP_MTAANI: "Pickup Mtaani",
};

/** Store pickup has no areas to price — the customer comes to you. */
const ZONED = ["DELIVERY", "PARCEL", "PICKUP_MTAANI"];

/**
 * Delivery methods and their zones.
 *
 * A single flat fee per method never survived contact with reality: riding to
 * Kilimani and couriering to Kisumu cost very different amounts, so the shop had
 * to either lose money on far orders or overcharge near ones. Zones let each
 * area carry its own price, with an optional per-zone free-delivery threshold.
 */
export default function Delivery() {
  const methods = useAsync(() => api.deliveryMethodsAll(), []);
  const [editing, setEditing] = useState<DeliveryMethod | null>(null);
  const [creating, setCreating] = useState(false);
  const [zoneFor, setZoneFor] = useState<{ method: DeliveryMethod; zone?: DeliveryZone } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      methods.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    }
  }

  return (
    <>
      <PageHeader
        title="Delivery"
        subtitle="How orders reach customers, and what each area costs"
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Icon.Plus className="h-4 w-4" />
            New method
          </button>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Icon.Alert className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      )}

      {methods.loading ? (
        <Spinner />
      ) : methods.error ? (
        <EmptyState title="Couldn't load delivery methods" hint={methods.error} />
      ) : (methods.data ?? []).length === 0 ? (
        <EmptyState
          title="No delivery methods yet"
          hint="Add how customers can receive their orders — pickup, rider delivery, courier."
        />
      ) : (
        <div className="space-y-4">
          {(methods.data ?? []).map((m) => {
            const zones = [...(m.zones ?? [])].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
            const canZone = ZONED.includes(m.type);
            return (
              <div key={m.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{m.name}</p>
                      <Badge tone="muted">{TYPE_LABEL[m.type] ?? m.type}</Badge>
                      {m.podAllowed && <Badge tone="gold">pay on delivery</Badge>}
                    </div>
                    {m.description && (
                      <p className="mt-1 text-sm text-muted">{m.description}</p>
                    )}
                    <p className="mt-1 text-xs text-faint">
                      {canZone && zones.length > 0
                        ? `${zones.length} area${zones.length === 1 ? "" : "s"}, priced individually`
                        : `Flat ${formatKes(m.baseCost)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={m.active}
                      onChange={(v) => run(() => api.updateDeliveryMethod(m.id, { active: v }))}
                      label="Available at checkout"
                    />
                    <button className="btn-ghost text-xs" onClick={() => setEditing(m)}>
                      <Icon.Edit className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>
                </div>

                {/* Zones */}
                {canZone && (
                  <div className="mt-4 border-t border-ink-line pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                        Areas &amp; pricing
                      </p>
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => setZoneFor({ method: m })}
                      >
                        <Icon.Plus className="h-3.5 w-3.5" />
                        Add area
                      </button>
                    </div>

                    {zones.length === 0 ? (
                      <p className="text-sm text-muted">
                        No areas yet — every order pays the flat {formatKes(m.baseCost)}. Add
                        areas to charge by distance.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {zones.map((z) => (
                          <div
                            key={z.id}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-line px-3 py-2.5 ${
                              z.active ? "" : "opacity-50"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-cloud">
                                {z.name}
                                {!z.active && (
                                  <span className="ml-2 text-xs text-faint">(hidden)</span>
                                )}
                              </p>
                              {z.description && (
                                <p className="text-xs text-faint">{z.description}</p>
                              )}
                              {z.freeAbove != null && (
                                <p className="text-xs text-whatsapp">
                                  Free over {formatKes(z.freeAbove)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-white">
                                {formatKes(z.price)}
                              </span>
                              <Toggle
                                checked={z.active}
                                onChange={(v) => run(() => api.updateZone(z.id, { active: v }))}
                                label={`${z.name} available`}
                              />
                              <button
                                className="text-muted transition-colors hover:text-cloud"
                                onClick={() => setZoneFor({ method: m, zone: z })}
                                aria-label={`Edit ${z.name}`}
                              >
                                <Icon.Edit className="h-4 w-4" />
                              </button>
                              <button
                                className="text-muted transition-colors hover:text-danger"
                                onClick={() => {
                                  if (!confirm(`Remove the "${z.name}" area?`)) return;
                                  run(() => api.deleteZone(z.id));
                                }}
                                aria-label={`Delete ${z.name}`}
                              >
                                <Icon.Trash className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <MethodModal
          method={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); methods.reload(); }}
        />
      )}

      {zoneFor && (
        <ZoneModal
          method={zoneFor.method}
          zone={zoneFor.zone}
          onClose={() => setZoneFor(null)}
          onSaved={() => { setZoneFor(null); methods.reload(); }}
        />
      )}
    </>
  );
}

function MethodModal({
  method, onClose, onSaved,
}: {
  method: DeliveryMethod | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: method?.name ?? "",
    type: method?.type ?? "DELIVERY",
    description: method?.description ?? "",
    baseCost: method ? String(centsToKes(method.baseCost)) : "0",
    podAllowed: method?.podAllowed ?? false,
    active: method?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const canZone = ZONED.includes(form.type);
  // Parcel and Mtaani hand the goods over before money changes hands.
  const podPossible = form.type === "STORE_PICKUP" || form.type === "DELIVERY";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        baseCost: kesToCents(Number(form.baseCost) || 0),
        podAllowed: podPossible ? form.podAllowed : false,
        active: form.active,
        ...(method ? {} : { type: form.type }),
      };
      if (method) await api.updateDeliveryMethod(method.id, payload);
      else await api.createDeliveryMethod(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={method ? `Edit ${method.name}` : "New delivery method"} onClose={onClose}>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Rider delivery"
          />
        </div>

        <div>
          <label className="label">Type</label>
          <select
            className="field"
            value={form.type}
            disabled={!!method}
            onChange={(e) => set("type", e.target.value)}
          >
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {method && (
            <p className="mt-1 text-xs text-faint">
              Type can't change after creation — past orders reference it.
            </p>
          )}
        </div>

        <div>
          <label className="label">Description (optional)</label>
          <input
            className="field"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Same-day within Nairobi, ordered before 2pm"
          />
        </div>

        <div>
          <label className="label">
            {canZone ? "Default price (Ksh)" : "Price (Ksh)"}
          </label>
          <input
            className="field"
            type="number"
            min="0"
            value={form.baseCost}
            onChange={(e) => set("baseCost", e.target.value)}
          />
          <p className="mt-1 text-xs text-faint">
            {canZone
              ? "Used only while this method has no areas. Once you add areas, each carries its own price."
              : "Store pickup is usually free."}
          </p>
        </div>

        {podPossible && (
          <label className="flex items-center gap-3">
            <Toggle checked={form.podAllowed} onChange={(v) => set("podAllowed", v)} />
            <span className="text-sm text-cloud">Allow pay on delivery</span>
          </label>
        )}

        <label className="flex items-center gap-3">
          <Toggle checked={form.active} onChange={(v) => set("active", v)} />
          <span className="text-sm text-cloud">Available at checkout</span>
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || form.name.trim().length < 2}>
          {busy ? "Saving…" : method ? "Save changes" : "Add method"}
        </button>
      </div>
    </Modal>
  );
}

function ZoneModal({
  method, zone, onClose, onSaved,
}: {
  method: DeliveryMethod;
  zone?: DeliveryZone;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: zone?.name ?? "",
    description: zone?.description ?? "",
    price: zone ? String(centsToKes(zone.price)) : "",
    freeAbove: zone?.freeAbove != null ? String(centsToKes(zone.freeAbove)) : "",
    active: zone?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: kesToCents(Number(form.price) || 0),
        freeAbove: form.freeAbove ? kesToCents(Number(form.freeAbove)) : null,
        active: form.active,
      };
      if (zone) await api.updateZone(zone.id, payload);
      else await api.createZone(method.id, payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the area");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={zone ? `Edit ${zone.name}` : `New area — ${method.name}`} onClose={onClose}>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label">Area name</label>
          <input
            className="field"
            value={form.name}
            autoFocus
            onChange={(e) => set("name", e.target.value)}
            placeholder="Nairobi CBD"
          />
          <p className="mt-1 text-xs text-faint">
            What customers pick at checkout — keep it recognisable.
          </p>
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input
            className="field"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Same day, delivered by 6pm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Delivery cost (Ksh)</label>
            <input
              className="field"
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Free over (Ksh)</label>
            <input
              className="field"
              type="number"
              min="0"
              value={form.freeAbove}
              onChange={(e) => set("freeAbove", e.target.value)}
              placeholder="leave blank"
            />
            <p className="mt-1 text-xs text-faint">
              Waives the fee for this area once the order reaches this amount.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3">
          <Toggle checked={form.active} onChange={(v) => set("active", v)} />
          <span className="text-sm text-cloud">Offered at checkout</span>
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={save}
          disabled={busy || form.name.trim().length < 2 || form.price === ""}
        >
          {busy ? "Saving…" : zone ? "Save area" : "Add area"}
        </button>
      </div>
    </Modal>
  );
}

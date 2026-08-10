import { useState } from "react";
import { api } from "@/lib/api";
import { formatKes, kesToCents, centsToKes } from "@/lib/money";
import type { DeliveryMethod } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync,
} from "@/components/ui";

const NEVER_POD = ["PARCEL", "PICKUP_MTAANI"];

export default function Delivery() {
  const methods = useAsync(() => api.deliveryMethods(), []);
  const [creating, setCreating] = useState(false);

  async function patch(m: DeliveryMethod, body: Record<string, unknown>) {
    await api.updateDeliveryMethod(m.id, body);
    methods.reload();
  }

  return (
    <>
      <PageHeader
        title="Delivery methods"
        subtitle="Costs and pay-on-delivery rules per method"
        action={<button className="btn-primary" onClick={() => setCreating(true)}>Add method</button>}
      />

      {methods.loading ? (
        <Spinner />
      ) : methods.error ? (
        <EmptyState title="Couldn’t load methods" hint={methods.error} />
      ) : (
        <div className="space-y-3">
          {methods.data!.map((m) => {
            const podLocked = NEVER_POD.includes(m.type);
            return (
              <div key={m.id} className="card flex flex-wrap items-center gap-6 p-5">
                <div className="min-w-40 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{m.name}</span>
                    <Badge>{m.type.replace("_", " ").toLowerCase()}</Badge>
                  </div>
                  {m.description && <p className="mt-1 text-xs text-muted">{m.description}</p>}
                </div>

                <div>
                  <p className="label">Cost</p>
                  <CostEditor
                    valueCents={m.baseCost}
                    onSave={(cents) => patch(m, { baseCost: cents })}
                  />
                </div>

                <div className="text-center">
                  <p className="label">Pay on delivery</p>
                  <div className="flex justify-center">
                    <Toggle
                      checked={m.podAllowed}
                      disabled={podLocked}
                      onChange={(v) => patch(m, { podAllowed: v })}
                    />
                  </div>
                  {podLocked && <p className="mt-1 text-[10px] text-faint">never for this type</p>}
                </div>

                <div className="text-center">
                  <p className="label">Active</p>
                  <div className="flex justify-center">
                    <Toggle checked={m.active} onChange={(v) => patch(m, { active: v })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <MethodModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); methods.reload(); }} />
      )}
    </>
  );
}

function CostEditor({
  valueCents, onSave,
}: {
  valueCents: number;
  onSave: (cents: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [kes, setKes] = useState(centsToKes(valueCents));

  if (!editing)
    return (
      <button className="text-sm text-cloud hover:text-indigo" onClick={() => setEditing(true)}>
        {valueCents === 0 ? "Free" : formatKes(valueCents)} ✎
      </button>
    );

  return (
    <div className="flex items-center gap-2">
      <input
        className="field w-24 py-1"
        type="number"
        value={kes}
        onChange={(e) => setKes(Number(e.target.value))}
        autoFocus
      />
      <button
        className="text-sm text-whatsapp"
        onClick={() => { onSave(kesToCents(kes)); setEditing(false); }}
      >
        ✓
      </button>
    </div>
  );
}

function MethodModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", type: "DELIVERY", description: "", baseCost: 0, podAllowed: false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const podLocked = NEVER_POD.includes(form.type);

  async function save() {
    setBusy(true);
    try {
      await api.createDeliveryMethod({
        name: form.name,
        type: form.type,
        description: form.description || undefined,
        baseCost: kesToCents(Number(form.baseCost)),
        podAllowed: podLocked ? false : form.podAllowed,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add delivery method" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="field" value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="STORE_PICKUP">In-store pickup</option>
            <option value="DELIVERY">Delivery</option>
            <option value="PARCEL">Parcel (Matatu)</option>
            <option value="PICKUP_MTAANI">Pickup Mtaani</option>
          </select>
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input className="field" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div>
          <label className="label">Cost (Ksh)</label>
          <input className="field" type="number" value={form.baseCost} onChange={(e) => set("baseCost", e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={podLocked ? false : form.podAllowed} disabled={podLocked} onChange={(v) => set("podAllowed", v)} />
          <span className="text-sm text-cloud">
            Allow pay on delivery {podLocked && <span className="text-faint">(not for this type)</span>}
          </span>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || !form.name}>
          {busy ? "Saving…" : "Add method"}
        </button>
      </div>
    </Modal>
  );
}

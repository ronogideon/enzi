import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Spinner, EmptyState, useAsync } from "@/components/ui";

// Business settings the admin controls. Stored as key/value in the settings API.
const FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "store.name", label: "Store name", placeholder: "Enzi Packaging" },
  { key: "store.phone", label: "Contact phone", placeholder: "+254 1100-50620" },
  { key: "store.email", label: "Contact email", placeholder: "info@enzipackaging.co.ke" },
  { key: "store.address", label: "Address", placeholder: "Dynamic Mall Suite ML135, Nairobi" },
  { key: "store.whatsapp", label: "WhatsApp number", placeholder: "254110050620" },
  { key: "store.freeDeliveryThreshold", label: "Free delivery over (Ksh, optional)", placeholder: "5000" },
];

export default function Settings() {
  const { data, loading, error, reload } = useAsync<Record<string, unknown>>(
    () => api.settings(),
    []
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  if (data && !seeded) {
    const v: Record<string, string> = {};
    for (const f of FIELDS) v[f.key] = (data[f.key] as string) ?? "";
    setValues(v);
    setSeeded(true);
  }

  async function saveOne(key: string) {
    setSavingKey(key);
    setSavedKey(null);
    try {
      await api.setSetting(key, values[key]);
      setSavedKey(key);
      reload();
      setTimeout(() => setSavedKey(null), 1500);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Business details used across your store" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState title="Couldn’t load settings" hint={error} />
      ) : (
        <div className="card max-w-2xl divide-y divide-ink-line">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-end gap-3 p-5">
              <div className="flex-1">
                <label className="label">{f.label}</label>
                <input
                  className="field"
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
              <button
                className="btn-ghost"
                onClick={() => saveOne(f.key)}
                disabled={savingKey === f.key}
              >
                {savingKey === f.key ? "Saving…" : savedKey === f.key ? "Saved ✓" : "Save"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-faint">
        Payment credentials (M-Pesa, SMS) live in the backend environment, not here —
        they never touch the browser.
      </p>
    </>
  );
}

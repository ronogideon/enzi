import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SettingsMap } from "@/lib/types";
import { PageHeader, Spinner, EmptyState, Badge, useAsync } from "@/components/ui";

type TabKey = "business" | "payments" | "kopokopo" | "sms" | "account";

interface Field {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "password" | "select";
  options?: { value: string; label: string }[];
}

const TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "business", label: "Business" },
  { key: "payments", label: "M-Pesa" },
  { key: "kopokopo", label: "Kopo Kopo", adminOnly: true },
  { key: "sms", label: "SMS", adminOnly: true },
  { key: "account", label: "My account" },
];

const BUSINESS: Field[] = [
  { key: "store.name", label: "Store name", placeholder: "Enzi Packaging" },
  { key: "store.phone", label: "Contact phone", placeholder: "+254 1100-50620" },
  { key: "store.email", label: "Contact email", placeholder: "info@enzipackaging.co.ke" },
  { key: "store.address", label: "Address", placeholder: "Dynamic Mall Suite ML135, Nairobi" },
  { key: "store.whatsapp", label: "WhatsApp number", placeholder: "254110050620" },
  {
    key: "store.freeDeliveryThreshold",
    label: "Free delivery over (Ksh)",
    placeholder: "5000",
    hint: "Leave blank to charge delivery on every order.",
  },
];

/**
 * Which gateway takes online payments. Both end in the same customer
 * experience — an STK prompt on the phone — so this is purely about who you
 * hold the merchant relationship with.
 */
const GATEWAY: Field[] = [
  {
    key: "payments.provider",
    label: "Payment gateway",
    type: "select",
    options: [
      { value: "mpesa", label: "M-Pesa (Daraja) — direct from Safaricom" },
      { value: "kopokopo", label: "Kopo Kopo — settles to your K2 till" },
    ],
    hint: "If the one you pick isn't fully configured, checkout falls back to whichever is — so a half-finished switch can't take the shop offline.",
  },
];

const KOPOKOPO: Field[] = [
  {
    key: "kopokopo.enabled",
    label: "Kopo Kopo payments",
    type: "select",
    options: [
      { value: "false", label: "Off" },
      { value: "true", label: "On" },
    ],
  },
  {
    key: "kopokopo.env",
    label: "Environment",
    type: "select",
    options: [
      { value: "sandbox", label: "Sandbox (testing)" },
      { value: "production", label: "Production (real money)" },
    ],
    hint: "Switch to production only once a sandbox payment has gone through end to end.",
  },
  { key: "kopokopo.tillNumber", label: "Till number", placeholder: "K2 till, e.g. 112233" },
  { key: "kopokopo.clientId", label: "Client ID" },
  { key: "kopokopo.clientSecret", label: "Client secret", type: "password" },
  {
    key: "kopokopo.apiKey",
    label: "API key (webhook signing)",
    type: "password",
    hint: "Used to verify that incoming payment confirmations really came from Kopo Kopo. Without it, anyone who learns your callback URL could mark orders paid.",
  },
  {
    key: "kopokopo.callbackUrl",
    label: "Callback URL",
    placeholder: "https://api.enzipackaging.com/api/payments/kopokopo/callback",
    hint: "Where Kopo Kopo confirms payment. Register this same URL in your Kopo Kopo dashboard — payments never confirm without it.",
  },
];

const PAYMENTS: Field[] = [
  {
    key: "mpesa.enabled",
    label: "M-Pesa payments",
    type: "select",
    options: [
      { value: "true", label: "On — customers can pay by M-Pesa" },
      { value: "false", label: "Off — pay on delivery only" },
    ],
  },
  {
    key: "mpesa.env",
    label: "Environment",
    type: "select",
    options: [
      { value: "sandbox", label: "Sandbox (testing)" },
      { value: "production", label: "Production (real money)" },
    ],
    hint: "Switch to production only once you've tested a sandbox payment end to end.",
  },
  { key: "mpesa.shortcode", label: "Paybill / Till number", placeholder: "174379" },
  {
    key: "mpesa.transactionType",
    label: "Account type",
    type: "select",
    options: [
      { value: "CustomerPayBillOnline", label: "Paybill" },
      { value: "CustomerBuyGoodsOnline", label: "Buy Goods (Till)" },
    ],
  },
  { key: "mpesa.consumerKey", label: "Consumer key", type: "password" },
  { key: "mpesa.consumerSecret", label: "Consumer secret", type: "password" },
  { key: "mpesa.passkey", label: "Passkey", type: "password" },
  {
    key: "mpesa.callbackUrl",
    label: "Callback URL",
    placeholder: "https://your-backend.up.railway.app/api/payments/mpesa/callback",
    hint: "Where Safaricom confirms payment. Must be your backend's public URL — payments never confirm without it.",
  },
];

const SMS: Field[] = [
  {
    key: "sms.enabled",
    label: "SMS sending",
    type: "select",
    options: [
      { value: "true", label: "On" },
      { value: "false", label: "Off" },
    ],
  },
  { key: "sms.username", label: "Africa's Talking username", placeholder: "enzipackaging" },
  { key: "sms.apiKey", label: "API key", type: "password" },
  {
    key: "sms.senderId",
    label: "Sender ID",
    placeholder: "ENZI",
    hint: "The name customers see. Must be registered with Africa's Talking first.",
  },
];

export default function Settings() {
  const { can } = useAuth();
  const [tab, setTab] = useState<TabKey>("business");
  const settings = useAsync<SettingsMap>(() => api.settings(), []);

  const tabs = TABS.filter((t) => !t.adminOnly || can(["SUPERADMIN", "ADMIN"]));

  return (
    <>
      <PageHeader title="Settings" subtitle="Business details, payment keys and your own login" />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === t.key
                ? "border-white/40 text-white"
                : "border-ink-line text-muted hover:text-cloud"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "account" ? (
        <AccountPanel />
      ) : settings.loading ? (
        <Spinner />
      ) : settings.error ? (
        <EmptyState title="Couldn't load settings" hint={settings.error} />
      ) : tab === "business" ? (
        <SettingsForm
          title="Business details"
          description="Used across the storefront — contact strip, footer and receipts."
          fields={BUSINESS}
          settings={settings.data!}
          onSaved={settings.reload}
        />
      ) : tab === "payments" ? (
        <SettingsForm
          title="M-Pesa (Daraja)"
          description="From your Safaricom Daraja app. Saved here, they take effect on the very next checkout — no redeploy needed."
          fields={PAYMENTS}
          settings={settings.data!}
          onSaved={settings.reload}
          onTest={api.testMpesa}
          testLabel="Test M-Pesa connection"
        />
      ) : (
        <SettingsForm
          title="Africa's Talking (SMS)"
          description="Used for order notifications and marketing campaigns."
          fields={SMS}
          settings={settings.data!}
          onSaved={settings.reload}
          onTest={api.testSms}
          testLabel="Test SMS connection"
        />
      )}
    </>
  );
}

function SettingsForm({
  title, description, fields, settings, onSaved, onTest, testLabel,
}: {
  title: string;
  description: string;
  fields: Field[];
  settings: SettingsMap;
  onSaved: () => void;
  onTest?: () => Promise<{ ok: boolean; message?: string }>;
  testLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  /**
   * Secrets arrive masked ("••••••4821"). We keep the input empty rather than
   * pre-filling the mask, so a save can only ever send a genuinely new value —
   * you can't accidentally overwrite a working key with its own placeholder.
   */
  const current = (f: Field) => {
    if (values[f.key] !== undefined) return values[f.key];
    const entry = settings[f.key];
    if (!entry) return "";
    return entry.secret ? "" : entry.value;
  };

  const dirty = Object.keys(values).length > 0;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    setTestResult(null);
    try {
      await api.saveSettings(values);
      setValues({});
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!onTest) return;
    setBusy(true);
    setTestResult(null);
    try {
      const res = await onTest();
      setTestResult({ ok: true, message: res.message ?? "Connection works." });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Connection failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-2xl p-6">
      <h2 className="font-display text-lg font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {testResult && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            testResult.ok
              ? "border-whatsapp/30 bg-whatsapp/10 text-whatsapp"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="mt-6 space-y-5">
        {fields.map((f) => {
          const entry = settings[f.key];
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between gap-2">
                <label className="label mb-0">{f.label}</label>
                {entry?.secret && entry.isSet && (
                  <span className="text-xs text-faint">
                    saved: <span className="font-mono text-muted">{entry.value}</span>
                  </span>
                )}
                {entry?.source === "environment" && (
                  <Badge tone="muted">from env</Badge>
                )}
              </div>

              {f.type === "select" ? (
                <select
                  className="field"
                  value={current(f) || f.options?.[0]?.value || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="field"
                  type={f.type === "password" ? "password" : "text"}
                  autoComplete={f.type === "password" ? "new-password" : "off"}
                  spellCheck={false}
                  value={current(f)}
                  placeholder={
                    entry?.secret && entry.isSet
                      ? "leave blank to keep the saved key"
                      : f.placeholder
                  }
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}

              {f.hint && <p className="mt-1 text-xs text-faint">{f.hint}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
        {onTest && (
          <button className="btn-ghost" onClick={test} disabled={busy}>
            {testLabel ?? "Test connection"}
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-faint">
        Keys are stored in your database and never sent back to the browser in full —
        only the last four characters are shown so you can confirm which key is loaded.
      </p>
    </div>
  );
}

function AccountPanel() {
  const { staff } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = form.next.length > 0 && form.confirm.length > 0 && form.next !== form.confirm;
  const valid = form.current.length > 0 && form.next.length >= 8 && !mismatch;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.changeOwnPassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-lg p-6">
      <h2 className="font-display text-lg font-bold text-white">My account</h2>
      <p className="mt-1 text-sm text-muted">
        Signed in as {staff?.name} ({staff?.role.toLowerCase()}).
      </p>

      {staff?.mustChangePassword && (
        <div className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
          You're still on a temporary password. Set your own below.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {done && (
        <div className="mt-4 rounded-lg border border-whatsapp/30 bg-whatsapp/10 px-3 py-2 text-sm text-whatsapp">
          Password changed.
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div>
          <label className="label">Current password</label>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
          />
          <p className="mt-1 text-xs text-faint">At least 8 characters.</p>
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
          {mismatch && <p className="mt-1 text-xs text-danger">These don't match.</p>}
        </div>
      </div>

      <button className="btn-primary mt-6" onClick={submit} disabled={busy || !valid}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </div>
  );
}

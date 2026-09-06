import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SettingsMap } from "@/lib/types";
import { PageHeader, Spinner, EmptyState, Badge, useAsync } from "@/components/ui";
import { Icon } from "@/components/Icons";

type TabKey = "business" | "payments" | "sms" | "account";

interface Field {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "password" | "select";
  options?: { value: string; label: string }[];
}

const TABS: { key: TabKey; label: string; icon: keyof typeof Icon; adminOnly?: boolean }[] = [
  { key: "business", label: "Business", icon: "Products" },
  { key: "payments", label: "Payments", icon: "Money", adminOnly: true },
  { key: "sms", label: "SMS", icon: "Sms", adminOnly: true },
  { key: "account", label: "My account", icon: "Staff" },
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

const KOPOKOPO: Field[] = [
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
  {
    key: "sms.apiKey",
    label: "API token",
    type: "password",
    hint: "From your Talk Sasa dashboard. Stored encrypted.",
  },
  {
    key: "sms.senderId",
    label: "Sender ID",
    placeholder: "ENZI",
    hint: "The name customers see. It must be registered with Talk Sasa — an unregistered sender ID is the commonest reason messages vanish without any error.",
  },
  {
    key: "sms.baseUrl",
    label: "API base URL",
    placeholder: "https://bulksms.talksasa.com/api/v3",
    hint: "Only change this if Talk Sasa tell you to.",
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

      {/* Underlined tabs sitting on a single faint rule, so the divider reads
          as one continuous line with the active tab cutting through it. */}
      <div className="mb-8 border-b border-ink-line">
        <div className="-mb-px flex gap-8 overflow-x-auto">
          {tabs.map((t) => {
            const Glyph = Icon[t.icon];
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm transition-colors ${
                  active
                    ? "border-white text-white"
                    : "border-transparent text-muted hover:border-white/20 hover:text-cloud"
                }`}
              >
                <Glyph className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
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
        <PaymentsPanel settings={settings.data!} onSaved={settings.reload} />
      ) : (
        <SettingsForm
          title="Talk Sasa (SMS)"
          description="Used for order notifications and marketing campaigns. Test the connection after saving — it reads your credit balance back."
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

/**
 * Payments.
 *
 * Only one gateway processes money at a time, so this is a choice, not two
 * parallel forms: pick the provider, fill in its keys, test it, then it's live.
 * Presenting both side by side invited the failure mode of half-configuring one
 * while the other was silently in use.
 */
function PaymentsPanel({
  settings,
  onSaved,
}: {
  settings: SettingsMap;
  onSaved: () => void;
}) {
  const current = settings["payments.provider"]?.value === "kopokopo" ? "kopokopo" : "mpesa";

  // null = showing the list; a key = showing that method's setup page.
  const [openKey, setOpenKey] = useState<"mpesa" | "kopokopo" | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = [
    {
      key: "mpesa" as const,
      name: "M-Pesa (Daraja)",
      blurb: "Direct from Safaricom, straight to your own paybill or till. No middleman fee.",
      requires: ["mpesa.consumerKey", "mpesa.consumerSecret", "mpesa.shortcode", "mpesa.passkey"],
      fields: PAYMENTS,
      test: api.testMpesa,
    },
    {
      key: "kopokopo" as const,
      name: "Kopo Kopo",
      blurb:
        "Settles to your Kopo Kopo till and reconciles payments in their dashboard, for a transaction fee.",
      requires: ["kopokopo.clientId", "kopokopo.clientSecret", "kopokopo.tillNumber"],
      fields: KOPOKOPO,
      test: api.testKopokopo,
    },
  ];

  const isConfigured = (keys: string[]) => keys.every((k) => settings[k]?.isSet);

  /**
   * Activating a method is just pointing payments.provider at it. Only one can
   * be active because only one processes a given checkout, so turning one on is
   * what turns the other off.
   */
  async function activate(provider: "mpesa" | "kopokopo") {
    setSwitching(provider);
    setError(null);
    try {
      await api.setSetting("payments.provider", provider);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't switch payment method");
    } finally {
      setSwitching(null);
    }
  }

  const open = providers.find((p) => p.key === openKey) ?? null;

  // --- expanded setup page for one method ---------------------------------
  if (open) {
    const configured = isConfigured(open.requires);
    const isActive = current === open.key;
    return (
      <div className="max-w-2xl">
        <button
          onClick={() => setOpenKey(null)}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-cloud"
        >
          <Icon.ChevronUp className="h-4 w-4 -rotate-90" />
          All payment methods
        </button>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <Icon.Alert className="mt-0.5 h-4 w-4" />
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold text-white">{open.name}</h2>
          {configured ? (
            <Badge tone={isActive ? "green" : "muted"}>{isActive ? "active" : "ready"}</Badge>
          ) : (
            <Badge tone="gold">not set up</Badge>
          )}
        </div>

        <SettingsForm
          title="Credentials"
          description="Saved encrypted in your database and never shown again in full. They take effect on the very next checkout — no redeploy."
          fields={open.fields}
          settings={settings}
          onSaved={onSaved}
          onTest={open.test}
          testLabel={`Test ${open.name} connection`}
        />

        {/* Activate from inside the setup page, once it's configured. */}
        {!isActive && (
          <div className="mt-6 rounded-xl border border-ink-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">
                  Use {open.name} for checkout
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {configured
                    ? "Test the connection first, then switch. This turns the other method off."
                    : "Fill in and save the required credentials above to enable this."}
                </p>
              </div>
              <button
                className="btn-primary shrink-0"
                onClick={() => activate(open.key)}
                disabled={!configured || switching !== null}
              >
                {switching === open.key ? "Activating…" : "Make active"}
              </button>
            </div>
          </div>
        )}
        {isActive && (
          <p className="mt-6 flex items-center gap-2 text-sm text-whatsapp">
            <Icon.Check className="h-4 w-4" />
            This is the active payment method.
          </p>
        )}
      </div>
    );
  }

  // --- the list -----------------------------------------------------------
  return (
    <div className="max-w-2xl">
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Icon.Alert className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      )}

      <h2 className="font-display text-lg font-bold text-white">Payment methods</h2>
      <p className="mt-1 text-sm text-muted">
        One method is active at a time — customers see the same M-PESA prompt either way.
        Tap a method to set it up, test it, and switch to it.
      </p>

      <div className="mt-5 divide-y divide-ink-line overflow-hidden rounded-xl border border-ink-line">
        {providers.map((p) => {
          const configured = isConfigured(p.requires);
          const isActive = current === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setOpenKey(p.key)}
              className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink-hover/50"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                  isActive ? "bg-whatsapp/15 text-whatsapp" : "bg-ink-800 text-muted"
                }`}
              >
                <Icon.Money className="h-5 w-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{p.name}</span>
                  {configured ? (
                    <Badge tone={isActive ? "green" : "muted"}>
                      {isActive ? "active" : "ready"}
                    </Badge>
                  ) : (
                    <Badge tone="gold">not set up</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{p.blurb}</p>
              </div>

              <Icon.ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-faint" />
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-faint">
        Tap a method to enter its keys and activate it. The active one can't be switched
        off directly — switching to the other is what changes it, so the shop always has a
        way to take payment.
      </p>
    </div>
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, apiBase, NetworkError } from "@/lib/api";

type Health = {
  ok: boolean;
  url: string;
  version?: string;
  error?: string;
  setupRequired?: boolean;
  database?: "ok" | "unreachable" | "no-schema";
} | null;

/**
 * The login screen doubles as a connection diagnostic. If the API can't be
 * reached, a bare "Failed to fetch" tells the operator nothing — so we probe
 * /health on mount, name the exact URL being used, and offer an inline
 * override so a misconfigured deployment can be fixed from the browser
 * instead of needing a redeploy to find out what was wrong.
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [health, setHealth] = useState<Health>(null);
  const [checking, setChecking] = useState(true);
  const [showFixer, setShowFixer] = useState(false);
  const [customUrl, setCustomUrl] = useState(apiBase.get());

  async function check() {
    setChecking(true);
    setHealth(await api.health());
    setChecking(false);
  }

  useEffect(() => { void check(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      if (err instanceof NetworkError) {
        setError(err.message);
        setShowFixer(true);
        void check();
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function applyUrl() {
    const resolved = apiBase.set(customUrl);
    setCustomUrl(resolved);
    setError(null);
    void check();
  }

  const unreachable = !checking && health && !health.ok;
  const noSchema = !checking && health?.ok && health.database === "no-schema";
  const noAccounts = !checking && health?.ok && health.setupRequired;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-extrabold tracking-tight text-white">ENZI</p>
          <p className="text-xs tracking-[0.4em] text-muted">ADMIN PORTAL</p>
        </div>

        {/* Connection banner — only ever shown when there's something wrong. */}
        {unreachable && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">
            <p className="font-medium text-danger">Can't reach the API</p>
            <p className="mt-1 text-xs text-muted">{health!.error}</p>
            <p className="mt-2 break-all text-xs text-faint">
              Trying: <span className="text-cloud">{health!.url}</span>
            </p>
            {apiBase.isSelfPointing() ? (
              <p className="mt-2 text-xs text-gold">
                <code>API_URL</code> is pointing at this dashboard instead of the backend.
                In Railway, open the <strong>backend</strong> service → Settings → Networking
                → Generate Domain, then use that address here.
              </p>
            ) : !apiBase.isConfigured() && !apiBase.isOverridden() ? (
              <p className="mt-2 text-xs text-gold">
                No API URL is configured. On Railway, set <code>API_URL</code> on the admin
                service to your backend's public URL (it can end in <code>/api</code> or not).
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setShowFixer((v) => !v)}
              className="mt-3 text-xs text-indigo hover:underline"
            >
              {showFixer ? "Hide" : "Set the API URL here"}
            </button>
          </div>
        )}

        {/* The database is up but the tables aren't there yet. */}
        {noSchema && (
          <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
            <p className="font-medium text-gold">The database has no tables yet</p>
            <p className="mt-1 text-muted">
              Run <code className="text-cloud">npm run db:push</code> in the backend
              service's Railway shell, then reload this page.
            </p>
          </div>
        )}

        {/* Connected, schema present, but nobody has ever been created. */}
        {noAccounts && (
          <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
            <p className="font-medium text-gold">No staff account exists yet</p>
            <p className="mt-1 text-muted">
              There's nothing to sign in to — no password will work until an account
              is created. Restart the backend service and it will create an owner
              account automatically, printing the login details in the deploy log.
            </p>
            <p className="mt-2 text-xs text-faint">
              Or run this in the backend's Railway shell:
              <br />
              <code className="text-cloud">
                ADMIN_EMAIL=you@enzipackaging.co.ke ADMIN_PASSWORD='your-password' npm run
                reset-admin
              </code>
            </p>
          </div>
        )}

        {showFixer && (
          <div className="mb-4 rounded-xl border border-ink-line bg-ink-800/60 p-4">
            <label className="label">API base URL</label>
            <input
              className="field"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://enzi-backend.up.railway.app/api"
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-faint">
              Saved in this browser only — a stop-gap so you can get in. Set{" "}
              <code>API_URL</code> on the Railway service for a permanent fix.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={applyUrl} className="btn-primary flex-1 text-sm">
                Save &amp; test
              </button>
              {apiBase.isOverridden() && (
                <button
                  type="button"
                  onClick={() => { setCustomUrl(apiBase.clear()); void check(); }}
                  className="btn-ghost text-sm"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="card space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              className="field"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@enzipackaging.co.ke"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          {checking ? (
            "Checking connection…"
          ) : health?.ok ? (
            <>
              Connected to API {health.version ? `v${health.version}` : ""}
              {health.database === "unreachable" && " — but the database is unreachable"}
            </>
          ) : (
            <button type="button" onClick={() => void check()} className="hover:text-muted">
              Retry connection
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

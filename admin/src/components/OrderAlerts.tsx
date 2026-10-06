import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/Icons";
import {
  canInstall,
  disablePush,
  enablePush,
  getPushStatus,
  iosNeedsInstall,
  onInstallChange,
  promptInstall,
  type PushStatus,
} from "@/lib/push";

/** Roles that receive new-order alerts — same as the backend's ORDER_ROLES. */
const ALERT_ROLES = ["SUPERADMIN", "ADMIN", "STAFF"];
const DISMISS_KEY = "enzi.orderAlerts.bannerDismissed";

function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [installable, setInstallable] = useState(canInstall());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getPushStatus().then(setStatus).catch(() => setStatus("unsupported"));
  }, []);

  useEffect(() => {
    refresh();
    const off = onInstallChange(() => setInstallable(canInstall()));
    // Permission can change in browser settings while the app is open.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return {
    status,
    installable,
    busy,
    message,
    enable: () => run(async () => setStatus(await enablePush())),
    disable: () =>
      run(async () => {
        await disablePush();
        setStatus(await getPushStatus());
      }),
    test: () =>
      run(async () => {
        const r = await api.pushTest();
        setMessage(r.sent > 0 ? "Test sent — check your notifications." : "No device received it. Try turning alerts off and on.");
      }),
    install: () => run(async () => void (await promptInstall())),
  };
}

/**
 * Sidebar/drawer control: install the app, turn order alerts on or off on
 * this device, and send a test.
 */
export function OrderAlertsControl() {
  const { staff } = useAuth();
  const p = usePush();
  if (!staff || !ALERT_ROLES.includes(staff.role) || p.status === null) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-ink-line pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-cloud">
        <Icon.Bell className="h-3.5 w-3.5" />
        Order alerts
        <span className={`ml-auto text-[10px] ${p.status === "on" ? "text-emerald-400" : "text-faint"}`}>
          {p.status === "on" ? "On" : p.status === "blocked" ? "Blocked" : "Off"}
        </span>
      </p>

      {p.status === "off" && (
        <button onClick={p.enable} disabled={p.busy} className="text-xs text-muted underline hover:text-cloud">
          {p.busy ? "Turning on…" : "Turn on for this device"}
        </button>
      )}
      {p.status === "on" && (
        <div className="flex gap-3 text-xs">
          <button onClick={p.test} disabled={p.busy} className="text-muted underline hover:text-cloud">
            Send test
          </button>
          <button onClick={p.disable} disabled={p.busy} className="text-faint underline hover:text-muted">
            Turn off
          </button>
        </div>
      )}
      {p.status === "blocked" && (
        <p className="text-[11px] leading-snug text-faint">
          Notifications are blocked. Allow them in your browser's site settings, then come back.
        </p>
      )}
      {p.status === "needs-install" && (
        <p className="text-[11px] leading-snug text-faint">
          On iPhone: tap Share → Add to Home Screen, open Enzi Admin from there, then turn alerts on.
        </p>
      )}
      {p.status === "unsupported" && (
        <p className="text-[11px] leading-snug text-faint">This browser can't receive notifications.</p>
      )}

      {p.installable && (
        <button onClick={p.install} disabled={p.busy} className="block text-xs text-muted underline hover:text-cloud">
          Install the app
        </button>
      )}
      {p.message && <p className="text-[11px] leading-snug text-muted">{p.message}</p>}
    </div>
  );
}

/**
 * One-time prompt at the top of the admin, until alerts are on or it's
 * dismissed. Shown on every screen size: a desktop at the counter benefits too.
 */
export function OrderAlertsBanner() {
  const { staff } = useAuth();
  const p = usePush();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  if (!staff || !ALERT_ROLES.includes(staff.role) || dismissed) return null;
  if (p.status !== "off" && p.status !== "needs-install") return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="card mb-6 flex items-start gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Icon.Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Get a notification for every new order</p>
        {p.status === "needs-install" ? (
          <p className="mt-1 text-xs text-muted">
            On iPhone, tap Share → <span className="text-cloud">Add to Home Screen</span>, open Enzi Admin from your
            home screen, and turn alerts on from there.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Alerts arrive on this device even when the admin is closed.
            {p.installable && " Install the app to keep it on your home screen."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {p.status === "off" && (
            <button onClick={p.enable} disabled={p.busy} className="btn-primary px-4 py-2 text-xs">
              {p.busy ? "Turning on…" : "Turn on alerts"}
            </button>
          )}
          {p.installable && (
            <button onClick={p.install} disabled={p.busy} className="btn-ghost px-4 py-2 text-xs">
              Install app
            </button>
          )}
        </div>
        {p.message && <p className="mt-2 text-xs text-danger">{p.message}</p>}
      </div>
      <button onClick={dismiss} className="text-faint hover:text-muted" aria-label="Dismiss">
        <Icon.Close className="h-4 w-4" />
      </button>
    </div>
  );
}

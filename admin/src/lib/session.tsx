import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Automatic sign-out for the admin dashboard.
 *
 * The admin is frequently left open on a shared computer at the shop counter,
 * where it can read every customer's contact details, change payment
 * credentials and issue refunds. A token that lives for hours is fine; an
 * unattended *screen* that stays signed in is not. So two things end a session:
 *
 *   1. Inactivity — 30 minutes of no interaction, with a visible warning at 2
 *      minutes so nobody loses work mid-form.
 *   2. Token expiry — the server issues staff tokens for 8 hours, and we sign
 *      out cleanly at that point rather than letting the next click fail with
 *      an unexplained 401.
 *
 * Activity is tracked with passive listeners and a ref rather than state, so
 * moving the mouse doesn't re-render the whole app.
 */

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARN_BEFORE_MS = 2 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "pointerdown",
] as const;

export function useIdleTimeout({
  enabled,
  onTimeout,
}: {
  enabled: boolean;
  onTimeout: () => void;
}) {
  const lastActive = useRef(Date.now());
  const [msLeft, setMsLeft] = useState<number | null>(null);

  const markActive = useCallback(() => {
    lastActive.current = Date.now();
    setMsLeft((current) => (current === null ? null : null));
  }, []);

  /** Called by the warning dialog's "I'm still here" button. */
  const stayActive = useCallback(() => {
    lastActive.current = Date.now();
    setMsLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setMsLeft(null);
      return;
    }

    for (const evt of ACTIVITY_EVENTS)
      window.addEventListener(evt, markActive, { passive: true });

    const timer = setInterval(() => {
      const idleFor = Date.now() - lastActive.current;
      const remaining = IDLE_LIMIT_MS - idleFor;

      if (remaining <= 0) {
        setMsLeft(null);
        onTimeout();
        return;
      }
      setMsLeft(remaining <= WARN_BEFORE_MS ? remaining : null);
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, markActive);
      clearInterval(timer);
    };
  }, [enabled, markActive, onTimeout]);

  return { warningMsLeft: msLeft, stayActive };
}

/** The banner shown in the final couple of minutes before an idle sign-out. */
export function IdleWarning({
  msLeft,
  onStay,
  onSignOut,
}: {
  msLeft: number;
  onStay: () => void;
  onSignOut: () => void;
}) {
  const minutes = Math.floor(msLeft / 60000);
  const seconds = Math.floor((msLeft % 60000) / 1000);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-4 sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-[min(28rem,90vw)] sm:-translate-x-1/2 sm:p-0">
      <div
        role="alertdialog"
        aria-live="assertive"
        className="card border-gold/40 p-4 shadow-2xl"
        style={{ animation: "modal-in 240ms cubic-bezier(0.32, 0.72, 0, 1) both" }}
      >
        <p className="font-medium text-white">Still there?</p>
        <p className="mt-1 text-sm text-muted">
          You'll be signed out in{" "}
          <span className="tabular-nums text-cloud">
            {minutes}:{String(seconds).padStart(2, "0")}
          </span>{" "}
          to keep the dashboard secure.
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1 text-sm" onClick={onStay}>
            Stay signed in
          </button>
          <button className="btn-ghost text-sm" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

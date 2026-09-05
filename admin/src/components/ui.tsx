import { useCallback, useEffect, useState, type ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
      {label ?? "Loading…"}
    </div>
  );
}

export function Badge({
  children, tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "green" | "gold" | "danger" | "indigo";
}) {
  const tones: Record<string, string> = {
    muted: "border-ink-line text-muted",
    green: "border-whatsapp/40 text-whatsapp",
    gold: "border-gold/40 text-gold",
    danger: "border-danger/40 text-danger",
    indigo: "border-indigo/40 text-indigo",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatCard({
  label, value, sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Switch.
 *
 * The knob used to be `absolute` with no `left`, which meant it fell back to
 * its static position — and because a <button> centres its inline content, that
 * static position was the middle of the track. Translating right from there put
 * the knob outside the pill entirely. Anchoring it to `left-0.5` and travelling
 * a measured 20px (44px track − 20px knob − 2px padding either side) keeps it
 * inside the track at both ends.
 *
 * `role="switch"` rather than `aria-pressed`: this reports an on/off state, not
 * a button that stays depressed, and screen readers announce it accordingly.
 */
export function Toggle({
  checked, onChange, disabled, label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full
        transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]
        active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? "bg-whatsapp" : "bg-ink-hover"}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full
          bg-white shadow-sm transition-transform duration-200
          ease-[cubic-bezier(0.23,1,0.32,1)]
          ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export function Modal({
  title, children, onClose, wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent the page behind from scrolling while the dialog is open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-start sm:overflow-y-auto sm:p-4 sm:py-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ animation: "modal-fade 160ms ease-out both" }}
    >
      {/* A bottom sheet on phones — reachable by thumb, and the form can be as
          tall as it needs without a dialog floating awkwardly mid-screen.
          A centred card from sm up. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`card flex max-h-[92vh] w-full flex-col rounded-b-none sm:max-h-none sm:rounded-2xl
          ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        style={{ animation: "modal-in 240ms cubic-bezier(0.32, 0.72, 0, 1) both" }}
      >
        {/* Grab handle: signals "this can be dismissed" on touch. */}
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />

        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-4 sm:px-6 sm:pt-6">
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-ink-hover hover:text-cloud active:scale-95"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Only the body scrolls, so the title and actions stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <p className="font-display text-lg text-white">{title}</p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title, subtitle, action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-bold text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {/* Full-width on a phone so the primary action is an easy target. */}
      {action && <div className="[&>button]:w-full sm:[&>button]:w-auto">{action}</div>}
    </div>
  );
}

/** Tiny data-fetching hook with loading/error/reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    fn()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { data, loading, error, reload: run, setData };
}

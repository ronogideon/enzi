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

export function Toggle({
  checked, onChange, disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-whatsapp" : "bg-ink-hover"
      } disabled:opacity-50`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10"
      onClick={onClose}
    >
      <div
        className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-cloud" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
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
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
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

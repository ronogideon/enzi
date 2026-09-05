"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";

/**
 * A small toast system, deliberately not a dependency.
 *
 * Design notes, following the Sonner principles:
 *   - No setup friction: <Toaster/> once in the layout, toast() anywhere.
 *   - Transitions, not keyframes, so a toast fired twice in quick succession
 *     retargets smoothly instead of restarting from zero.
 *   - Enter and exit are the same direction (up from below), which is what
 *     makes the motion read as one object arriving and leaving.
 *   - The timer pauses when the tab is hidden, so a toast fired just before
 *     someone switches tabs is still there when they come back.
 */

export interface ToastOptions {
  duration?: number;
  confetti?: boolean;
}

interface ToastItem {
  id: number;
  message: string;
  duration: number;
  confetti: boolean;
}

interface ToastApi {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    setItems((prev) => [
      // One at a time. Two stacked toasts saying near-identical things is
      // noise, and the shop never has more than one thing to announce.
      ...prev.filter((t) => t.message !== message),
      {
        id,
        message,
        duration: options.duration ?? 2000,
        confetti: options.confetti ?? false,
      },
    ]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:p-6"
        role="region"
        aria-live="polite"
      >
        {items.map((item) => (
          <Toast key={item.id} item={item} onDone={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Two frames before showing: the browser needs to paint the "from" state
    // once, or the transition has nothing to animate away from.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setVisible(true))
    );

    let remaining = item.duration;
    let startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const begin = () => {
      startedAt = Date.now();
      timer = setTimeout(() => {
        setVisible(false);
        // Let the exit transition finish before unmounting.
        setTimeout(onDone, 200);
      }, remaining);
    };

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        remaining -= Date.now() - startedAt;
      } else {
        begin();
      }
    };

    begin();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [item.duration, onDone]);

  return (
    <div
      className="pointer-events-auto relative"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        // Exit is faster than enter: the system responding should feel quick,
        // while the arrival gets a beat to be noticed.
        transition: visible
          ? "opacity 260ms var(--ease-out), transform 260ms var(--ease-out)"
          : "opacity 180ms ease, transform 180ms ease",
      }}
    >
      {item.confetti && visible && <Confetti />}
      <div className="flex items-center gap-3 rounded-full border border-ink-line bg-ink-card/95 px-5 py-3 text-sm font-medium text-cloud shadow-2xl backdrop-blur">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-whatsapp text-[11px] font-bold text-ink">
          ✓
        </span>
        {item.message}
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["#F5C518", "#25D366", "#5B6CF0", "#F4F4F5", "#EF4444"];

/**
 * A one-shot confetti burst behind the toast.
 *
 * Pure CSS transforms on a handful of absolutely positioned spans — no canvas,
 * no dependency, and it runs off the main thread. Keyframes are correct here
 * rather than transitions: this fires once and is never interrupted.
 *
 * Skipped entirely under prefers-reduced-motion. Celebration is decoration, and
 * decoration is exactly what should go first when someone asks for less motion.
 */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      // Spread across a shallow arc above the toast.
      x: (Math.random() - 0.5) * 220,
      y: -40 - Math.random() * 70,
      rotate: (Math.random() - 0.5) * 540,
      delay: Math.random() * 90,
      size: 5 + Math.random() * 4,
    }))
  );

  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (reduced) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute block rounded-[1px]"
          style={
            {
              width: `${p.size}px`,
              height: `${p.size * 1.6}px`,
              backgroundColor: p.color,
              animation: `confetti-fly 900ms cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}ms forwards`,
              "--cx": `${p.x}px`,
              "--cy": `${p.y}px`,
              "--cr": `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // Falling back to a no-op keeps a missing provider from crashing the shop
  // over what is, after all, only a notification.
  return ctx ?? { toast: () => undefined };
}

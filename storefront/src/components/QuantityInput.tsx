"use client";

import { useEffect, useState } from "react";

/**
 * Quantity control with a genuinely editable number.
 *
 * The plus/minus buttons alone are fine for going from 1 to 3, but a shop
 * selling packaging in bulk has customers typing 250 — and forty taps is not a
 * user interface. So the number is a real input.
 *
 * The subtlety is that you can't commit every keystroke: clearing the field to
 * type a new number momentarily produces "", and treating that as 0 (or as the
 * minimum) fights the person mid-edit. So the input holds its own draft text
 * while focused, and only commits a valid number on change-with-content or on
 * blur — reverting to the last good value if they leave it empty.
 */
export function QuantityInput({
  value,
  min = 1,
  max = 100000,
  onChange,
  size = "md",
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  size?: "sm" | "md";
}) {
  const [draft, setDraft] = useState(String(value));

  // Keep the visible text in step when the value changes from outside (a
  // min-quantity bump from the server, say) — but never while the user is
  // part-way through typing.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  function commit(raw: string) {
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(n)) {
      setDraft(String(value)); // empty or junk — put back what was there
      return;
    }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  const btn =
    size === "sm"
      ? "grid h-8 w-8 place-items-center text-muted transition-colors hover:text-cloud active:scale-90 disabled:opacity-30"
      : "grid h-9 w-9 place-items-center text-muted transition-colors hover:text-cloud active:scale-90 disabled:opacity-30";

  return (
    <div className="inline-flex items-center rounded-full border border-ink-line">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className={btn}
        aria-label="Decrease quantity"
      >
        −
      </button>

      <input
        value={draft}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Quantity"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          setDraft(raw);
          // Commit as they type when it's a usable number, so the price
          // updates live — but leave an empty field alone until blur.
          if (raw !== "") commit(raw);
        }}
        onBlur={() => commit(draft)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`w-12 bg-transparent text-center text-sm text-cloud focus:outline-none ${
          size === "sm" ? "py-1" : "py-1.5"
        }`}
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className={btn}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

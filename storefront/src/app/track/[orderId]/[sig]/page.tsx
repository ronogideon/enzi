import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiBase } from "@/lib/api";
import { formatKes } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false },
};

type Track = {
  orderNumber: string;
  status: string;
  step: number;
  tone: "progress" | "done" | "waiting" | "cancelled" | "closed";
  headline: string;
  detail: string;
  isPaid: boolean;
  isPayOnDelivery: boolean;
  total: number;
  trackingRef: string | null;
  delivery: string | null;
  placedAt: string;
  updatedAt: string;
  items: { name: string; variantLabel: string | null; quantity: number }[];
};

const STEPS = ["Confirmed", "Packing", "On the way", "Delivered"];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

function stepState(t: Track, i: number): "done" | "current" | "todo" {
  if (t.step > i || (t.tone === "done" && t.step >= i)) return "done";
  if (t.step === i) return "current";
  return "todo";
}

/**
 * Where "Track your order" in every email lands. The URL carries a signature
 * the API checks, so this page can't be used to look up other people's orders.
 */
export default async function TrackOrderPage({
  params,
}: {
  params: { orderId: string; sig: string };
}) {
  let t: Track | null = null;
  try {
    const res = await fetch(
      `${apiBase()}/track/${encodeURIComponent(params.orderId)}/${encodeURIComponent(params.sig)}`,
      { cache: "no-store" }
    );
    if (res.ok) t = (await res.json()) as Track;
  } catch {
    t = null;
  }
  if (!t) notFound();

  const headTone =
    t.tone === "cancelled" ? "text-red-300" : t.tone === "waiting" ? "text-gold" : "text-white";

  return (
    <div className="shell py-12">
      <div className="mx-auto max-w-md">
        <p className="eyebrow">Order {t.orderNumber}</p>
        <h1 className={`display mt-3 text-3xl ${headTone}`}>{t.headline}</h1>
        {t.detail && <p className="mt-2 text-sm text-muted">{t.detail}</p>}
        <p className="mt-1 text-xs text-faint">Updated {when(t.updatedAt)}</p>

        <ol className="card mt-8 p-6">
          {STEPS.map((label, i) => {
            const s = stepState(t!, i);
            const last = i === STEPS.length - 1;
            const lineOn = stepState(t!, i + 1) !== "todo";
            return (
              <li key={label} className="relative flex gap-4 pb-7 last:pb-0">
                {!last && (
                  <span
                    aria-hidden
                    className={`absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-0.5 rounded ${
                      lineOn ? "bg-whatsapp" : "bg-white/10"
                    }`}
                  />
                )}
                <span
                  aria-hidden
                  className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                    s === "done"
                      ? "bg-whatsapp"
                      : s === "current"
                        ? "border-2 border-whatsapp bg-ink-card"
                        : "border-2 border-white/15 bg-ink-card"
                  }`}
                >
                  {s === "done" && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="#0A0A0B"
                      strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8.5l3 3 6-7" />
                    </svg>
                  )}
                  {s === "current" && <span className="h-2 w-2 rounded-full bg-whatsapp" />}
                </span>
                <span
                  className={`pt-0.5 text-sm ${
                    s === "todo" ? "text-faint" : s === "current" ? "font-semibold text-white" : "text-cloud"
                  }`}
                >
                  {label}
                  <span className="sr-only">
                    {s === "done" ? " — done" : s === "current" ? " — current step" : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {(t.delivery || t.trackingRef) && (
          <div className="card mt-4 space-y-1 p-6 text-sm">
            {t.delivery && <p className="text-cloud">{t.delivery}</p>}
            {t.trackingRef && (
              <p className="text-muted">
                Reference: <span className="text-cloud">{t.trackingRef}</span>
              </p>
            )}
          </div>
        )}

        <div className="card mt-4 p-6">
          <ul className="space-y-2 text-sm">
            {t.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span className="text-cloud">
                  {it.name}
                  {it.variantLabel && <span className="text-faint"> · {it.variantLabel}</span>}
                </span>
                <span className="shrink-0 text-faint">× {it.quantity}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-ink-line pt-4 text-sm">
            <span className="text-muted">
              {t.isPaid ? "Paid" : t.isPayOnDelivery ? "Pay on delivery" : "Total"}
            </span>
            <span className="font-semibold text-white">{formatKes(t.total)}</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-faint">Placed {when(t.placedAt)}</p>
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-muted underline hover:text-cloud">Back to the shop</Link>
        </p>
      </div>
    </div>
  );
}

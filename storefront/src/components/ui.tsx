import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Image with a branded fallback. The old site showed broken <img> icons
 * everywhere products had no photo; this renders a quiet placeholder instead,
 * so a missing URL never looks broken.
 */
export function SmartImage({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-ink-hover to-ink-card ${className}`}
        aria-label={alt}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-10 w-10 text-faint/50"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" strokeLinejoin="round" />
          <path d="M3 7v10l9 4 9-4V7" strokeLinejoin="round" />
          <path d="M12 11v10" />
        </svg>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}

export function StarRating({
  value,
  size = 16,
}: {
  value: number;
  size?: number;
}) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill={n <= rounded ? "#F5C518" : "none"}
          stroke={n <= rounded ? "#F5C518" : "rgba(255,255,255,0.25)"}
          strokeWidth="1.5"
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.6 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  className = "",
}: {
  eyebrow: string;
  title: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={`mb-10 flex items-end justify-between gap-6 ${className}`}>
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h2 className="display text-3xl sm:text-4xl md:text-5xl">{title}</h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="hidden shrink-0 text-sm font-semibold uppercase tracking-wider text-cloud hover:text-white sm:inline-flex sm:items-center sm:gap-2"
        >
          {action.label} <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">{children}</div>
  );
}

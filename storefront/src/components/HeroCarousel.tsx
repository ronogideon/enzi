"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SmartImage } from "./ui";

export interface HeroSlide {
  title: string;
  subtitle: string;
  href: string;
  imageUrl?: string | null;
}

/** Rotates through pages of up to 3 feature cards. Order is shuffled once on
 * mount and the view auto-advances — the old hero was three fixed images. */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const shuffled = useMemo(() => {
    const s = [...slides];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s;
  }, [slides]);

  const pages = useMemo(() => {
    const out: HeroSlide[][] = [];
    for (let i = 0; i < shuffled.length; i += 3) out.push(shuffled.slice(i, i + 3));
    return out.length ? out : [[]];
  }, [shuffled]);

  const [page, setPage] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (pages.length < 2) return;
    const id = setInterval(() => {
      if (!paused.current) setPage((p) => (p + 1) % pages.length);
    }, 5000);
    return () => clearInterval(id);
  }, [pages.length]);

  const current = pages[page] ?? [];

  return (
    <section
      className="shell pt-10"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div key={page} className="grid animate-fade-in gap-6 md:grid-cols-3">
        {current.map((slide, i) => (
          <Link
            key={`${page}-${i}`}
            href={slide.href}
            className="card card-hover group relative flex min-h-[460px] flex-col justify-end overflow-hidden p-8"
          >
            <span className="absolute left-6 top-6 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-sm font-semibold text-cloud backdrop-blur">
              {String(page * 3 + i + 1).padStart(2, "0")}
            </span>
            <div className="absolute inset-0">
              <SmartImage
                src={slide.imageUrl}
                alt={slide.title}
                className="h-full w-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
            </div>
            <div className="relative z-10">
              <h3 className="display text-2xl md:text-3xl">{slide.title}</h3>
              <p className="mt-2 text-sm text-muted">{slide.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Go to slide group ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === page ? "w-6 bg-white" : "w-2 bg-white/25 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface BannerSlide {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
}

interface BannerProps {
  slides: BannerSlide[];
  /** ms between auto-advances. Ignored entirely when the user has
   *  prefers-reduced-motion set — no autoplay at all in that case, not
   *  just a slower one. */
  intervalMs?: number;
}

/**
 * 2:1 promotional banner carousel. Auto-swipes, pauses on hover/focus/touch,
 * resumes after a beat of inactivity. Content lives in the caller — this
 * component has zero opinions about what's honest to claim; keep that
 * discipline where the slides are defined; see LandingBanner.tsx for why.
 */
export const Banner: React.FC<BannerProps> = ({ slides, intervalMs = 5500 }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = slides.length;

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Autoplay — off entirely under reduced-motion, off while paused (hover/
  // focus/touch), off with fewer than 2 slides (nothing to advance to).
  useEffect(() => {
    if (prefersReducedMotion || paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [prefersReducedMotion, paused, count, intervalMs]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      if (delta < 0) next();
      else prev();
    }
    touchStartX.current = null;
    setPaused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  };

  if (count === 0) return null;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Announcements"
      className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl border border-elevated bg-surface shadow-lg sm:aspect-[2/1]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="flex h-full w-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => {
          const Icon = slide.icon;
          const active = i === index;
          return (
            <Link
              key={slide.id}
              href={slide.href}
              prefetch={false}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
              className="relative flex h-full w-full shrink-0 flex-col items-start justify-center gap-2 bg-gradient-to-br from-primary-faint/60 via-surface to-accent/10 px-5 py-4 sm:px-8"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary-soft sm:h-11 sm:w-11">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold leading-snug text-ink sm:text-lg">{slide.title}</h3>
              <p className="max-w-md text-xs leading-relaxed text-ink-muted sm:text-sm">{slide.description}</p>
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary-soft sm:text-sm">
                {slide.ctaLabel} →
              </span>
            </Link>
          );
        })}
      </div>

      {count > 1 && (
        <div
          role="group"
          aria-label="Slide navigation"
          className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1.5 sm:bottom-3.5"
        >
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Go to slide ${i + 1}: ${slide.title}`}
              aria-current={i === index}
              onClick={() => { goTo(i); setPaused(true); }}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-primary-strong' : 'w-1.5 bg-elevated hover:bg-ink-faint'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

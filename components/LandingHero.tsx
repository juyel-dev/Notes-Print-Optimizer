'use client';

import React from 'react';
import { ArrowDown, ShieldCheck } from 'lucide-react';

/**
 * Landing hero — one clear promise, one primary action, and one quiet trust
 * signal. Tool discovery belongs below; the hero should not compete with it.
 */
export const LandingHero: React.FC = () => {
  const scrollToTools = () => {
    const el = document.getElementById('tools');
    if (!el) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <section
      aria-label="Print Optimizer — made for students"
      className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary-faint/35 via-surface/70 to-surface/50 px-4 py-7 text-center sm:px-6 sm:py-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-16 h-60 w-60 rounded-full bg-accent/7 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-surface/90 px-3 py-1 text-[11px] font-bold tracking-wide text-primary-soft shadow-sm backdrop-blur-sm sm:text-xs">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Private by default · 100% on-device
        </span>

        <h1 className="text-balance text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
          Your Notes.{' '}
          <span className="bg-gradient-to-r from-primary-soft via-primary to-accent bg-clip-text text-transparent">
            Print-Ready in Seconds.
          </span>
        </h1>

        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-ink-muted sm:text-base">
          Whiten dark slides, clean up scans, arrange pages and convert files —
          right in your browser, without sending your documents away.
        </p>

        <button
          type="button"
          onClick={scrollToTools}
          aria-label="Choose a tool"
          className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-strong px-5 text-sm font-bold tracking-wide text-white shadow-lg shadow-primary/20 ring-1 ring-primary/20 transition-all hover:bg-primary hover:shadow-xl hover:shadow-primary/25 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          Choose a tool
          <ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>

        <p className="text-[11px] font-semibold tracking-wide text-ink-faint sm:text-xs">
          Free to use · No account · No upload
        </p>
      </div>
    </section>
  );
};

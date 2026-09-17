'use client';

import React from 'react';
import { GraduationCap, ShieldCheck, LayoutGrid, Sparkles, ArrowDown } from 'lucide-react';

const heroStats = [
  { icon: GraduationCap, label: 'NEET • JEE', sub: 'Boards Ready' },
  { icon: Sparkles, label: 'Dark → White', sub: 'Ink Saver' },
  { icon: LayoutGrid, label: '4 per Sheet', sub: 'Smart N-Up' },
  { icon: ShieldCheck, label: '100% Offline', sub: 'Private' },
];

/**
 * Best-practice hero — Print Optimizer is now multi-tool (merge / whiten / enhance).
 * Cobalt Ink → Marigold gradient stays as brand, but copy is generic. No
 * dark-slides-only messaging. CTA points to ToolsBox (not Upload).
 */
export const LandingHero: React.FC = () => {
  const scrollToTools = () => {
    const el = document.getElementById('tools');
    if (el) {
      const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  };

  return (
    <section
      aria-label="Print Optimizer — made for students"
      className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary-faint/40 via-surface/60 to-surface/40 px-4 py-6 sm:px-5 sm:py-8 text-center animate-slide-up"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-20 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-12 h-56 w-56 rounded-full bg-accent/8 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

      <div className="relative flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-surface/90 px-3 py-1 text-xs font-bold tracking-wide text-primary-soft shadow-sm backdrop-blur-sm">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          100% On-Device — Files Never Leave Your Phone
        </span>

        <h1 className="max-w-3xl text-balance text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
          Your Notes,{' '}
          <span className="bg-gradient-to-r from-primary-soft via-primary to-accent bg-clip-text text-transparent">
            Print-Ready in Seconds
          </span>
        </h1>

        <p className="max-w-xl text-pretty text-xs leading-relaxed text-ink-muted sm:text-sm">
          Turn dark lecture slides, handwritten notes &amp; PYQs into crisp, ink-saving handouts. Auto-whiten and N-up 4 per sheet —{' '}
          <span className="font-semibold text-ink">100% on your device</span>.
        </p>

        <button
          type="button"
          onClick={scrollToTools}
          aria-label="Scroll to tools"
          className="mt-0.5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-strong via-primary to-accent px-5 py-2.5 text-xs font-bold tracking-wide text-white shadow-lg shadow-primary/20 ring-1 ring-primary/20 transition-all hover:shadow-xl hover:shadow-primary/25 hover:from-primary-deep hover:via-primary-strong hover:to-accent-deep active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          <ArrowDown className="h-3.5 w-3.5 shrink-0 animate-bounce" aria-hidden="true" />
          Get Started
        </button>

        {/* Hint chips — visible on all viewports, responsive 2-col to 4-col */}
        <div className="grid w-full max-w-2xl grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-0.5 rounded-xl border border-elevated/70 bg-surface/80 px-2 py-2 shadow-sm backdrop-blur-xs transition-colors hover:border-primary/40"
            >
              <stat.icon className="h-3.5 w-3.5 text-primary-soft" aria-hidden="true" />
              <span className="text-2xs font-bold tracking-wide text-ink">{stat.label}</span>
              <span className="text-[10px] leading-none text-ink-muted">{stat.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
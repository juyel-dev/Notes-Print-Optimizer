'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LayoutGrid, ShieldCheck, WandSparkles } from 'lucide-react';
import { toolHref } from '@/lib/tools/registry';
import { TOOL_REGISTRY } from '@/lib/tools/registry';
import { MobileFeatureCarousel } from '@/components/MobileFeatureCarousel';

/**
 * Landing hero — one promise, one primary action, and a live demonstration
 * of the product's core result (dark slide → print-ready page). The demo is a
 * drawn mock, not a stat: it shows what the tool does without claiming a number.
 */

type SlideVariant = 'dark' | 'light';

const SLIDE_PALETTE: Record<SlideVariant, { bg: string; heading: string; line: string }> = {
  dark: { bg: '#1b2233', heading: '#f2a93c', line: '#e2e8f0' },
  light: { bg: '#ffffff', heading: '#b87a16', line: '#1c1b17' },
};

/** A tiny abstract lecture slide: heading bar, four text lines, three chart bars. */
function SlideMock({ variant }: { variant: SlideVariant }) {
  const p = SLIDE_PALETTE[variant];
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col gap-[5%] px-[8%] pb-[7%] pt-[19%]"
      style={{ background: p.bg }}
    >
      <div className="h-[9%] w-[46%] rounded" style={{ background: p.heading }} />
      <div className="flex flex-1 flex-col gap-[7%]">
        {[92, 80, 86, 58].map((w) => (
          <div key={w} className="h-[5%] rounded-sm" style={{ width: `${w}%`, background: p.line }} />
        ))}
      </div>
      <div className="flex h-[28%] items-end gap-[4%]">
        <div className="h-full w-[16%] rounded-sm" style={{ background: '#e5484d' }} />
        <div className="h-[70%] w-[16%] rounded-sm" style={{ background: '#3e63dd' }} />
        <div className="h-[85%] w-[16%] rounded-sm" style={{ background: '#30a46c' }} />
      </div>
    </div>
  );
}

function BeforeAfterDemo() {
  const [pos, setPos] = useState(50);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className="relative aspect-[16/11] w-full overflow-hidden rounded-[20px] border border-elevated bg-white shadow-float focus-within:ring-2 focus-within:ring-primary-soft focus-within:ring-offset-2 focus-within:ring-offset-bg"
      >
        <SlideMock variant="light" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <SlideMock variant="dark" />
        </div>

        <span className="absolute left-3.5 top-3.5 rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-ink">
          Original
        </span>
        <span className="absolute right-3.5 top-3.5 rounded-full bg-success-faint px-2.5 py-1 text-xs font-bold text-success-soft">
          Print-ready
        </span>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-px bg-primary"
          style={{ left: `${pos}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary-strong">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
            </svg>
          </span>
        </div>

        <input
          type="range"
          min={4}
          max={96}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Compare the original dark slide with the print-ready result"
          className="absolute inset-0 h-full w-full cursor-ew-resize touch-pan-y opacity-0"
        />
      </div>
      <p className="text-center text-[13px] text-ink-faint">
        Drag to compare a dark slide with its print-ready page
      </p>
    </div>
  );
}

export const LandingHero: React.FC = () => (
  <section
    aria-label="Print Optimizer — made for students"
    className="grid grid-cols-1 items-center gap-5 pb-0 pt-0 sm:gap-8 sm:pb-4 sm:pt-4 md:grid-cols-2 md:gap-14 md:py-10"
  >
    <div className="flex min-w-0 flex-col items-start gap-3.5 sm:gap-5 md:gap-6">
      <span className="hidden items-center gap-2 rounded-full border border-elevated px-3.5 py-1.5 text-xs font-semibold text-primary-soft sm:text-[13px] md:inline-flex">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Private by default · 100% on-device
      </span>

      <MobileFeatureCarousel />

      <h1
        className="sr-only md:not-sr-only text-balance text-[2.75rem] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-6xl"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Your notes,{' '}
        <span className="-mx-1 whitespace-nowrap bg-[linear-gradient(transparent_64%,rgb(242_169_60/0.55)_64%)] px-1">
          print-ready
        </span>{' '}
        in seconds.
      </h1>

      <p className="hidden max-w-xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg md:block">
        Whiten dark slides, clean up scans, arrange pages and convert files —
        right in your browser, without sending your documents away.
      </p>

      <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3">
        <Link
          href={toolHref('dark-print')}
          prefetch={false}
          className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-[14px] bg-primary-strong px-3 text-center text-[14px] font-bold leading-tight text-white shadow-sm transition-colors hover:bg-primary-deep active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft sm:min-h-[52px] sm:w-auto md:whitespace-nowrap md:px-6 md:text-base"
        >
          <WandSparkles className="h-4 w-4 shrink-0 md:hidden" aria-hidden="true" />
          <span>Whiten a dark PDF</span>
          <ArrowRight className="hidden h-[18px] w-[18px] shrink-0 md:block" aria-hidden="true" />
        </Link>
        <a
          href="#tools"
          className="inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-[14px] border border-elevated bg-transparent px-3 text-center text-[14px] font-semibold leading-tight text-ink transition-colors hover:border-primary/50 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft sm:min-h-[52px] sm:w-auto md:whitespace-nowrap md:text-base"
        >
          <LayoutGrid className="h-4 w-4 shrink-0 md:hidden" aria-hidden="true" />
          <span className="md:hidden">Browse all tools</span>
          <span className="hidden md:inline">Browse all {TOOL_REGISTRY.length} tools</span>
        </a>
      </div>

      <p className="flex items-center gap-1.5 text-[13px] text-ink-muted md:hidden">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
        Free, no account. Your files never leave your phone.
      </p>
      <p className="hidden font-mono text-[13px] tracking-wide text-ink-faint md:block">
        Free · No account · No upload
      </p>
    </div>

    <BeforeAfterDemo />
  </section>
);

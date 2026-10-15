'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { toolHref } from '@/lib/tools/registry';
import { TOOL_REGISTRY } from '@/lib/tools/registry';

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
      className="absolute inset-0 flex flex-col gap-[5%] px-[8%] py-[9%]"
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
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-[16/11] w-full overflow-hidden rounded-[20px] border border-elevated bg-white shadow-float"
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
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
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
    className="grid items-center gap-10 py-6 md:grid-cols-2 md:gap-14 md:py-10"
  >
    <div className="flex flex-col items-start gap-6">
      <span className="inline-flex items-center gap-2 rounded-full border border-elevated px-3.5 py-1.5 text-xs font-semibold text-primary-soft sm:text-[13px]">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Private by default · 100% on-device
      </span>

      <h1
        className="text-balance text-[2.75rem] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-6xl"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Your notes,{' '}
        <span className="-mx-1 whitespace-nowrap bg-[linear-gradient(transparent_64%,rgb(242_169_60/0.55)_64%)] px-1">
          print-ready
        </span>{' '}
        in seconds.
      </h1>

      <p className="max-w-xl text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
        Whiten dark slides, clean up scans, arrange pages and convert files —
        right in your browser, without sending your documents away.
      </p>

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link
          href={toolHref('dark-print')}
          prefetch={false}
          className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-[14px] bg-primary-strong px-6 text-base font-bold text-white transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          Whiten a dark PDF
          <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        </Link>
        <a
          href="#tools"
          className="inline-flex min-h-[52px] items-center justify-center rounded-[14px] border border-elevated px-5 text-base font-semibold text-ink transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
        >
          Browse all {TOOL_REGISTRY.length} tools
        </a>
      </div>

      <p className="font-mono text-[13px] tracking-wide text-ink-faint">
        Free · No account · No upload
      </p>
    </div>

    <BeforeAfterDemo />
  </section>
);

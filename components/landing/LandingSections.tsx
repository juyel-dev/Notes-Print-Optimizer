import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Download,
  Droplets,
  FileUp,
  Layers,
  LayoutGrid,
  ShieldCheck,
  Smartphone,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { FaqAccordion } from '@/components/seo/FaqAccordion';
import { TOOL_REGISTRY, toolHref } from '@/lib/tools/registry';
import type { FaqItem } from '@/lib/content/faqs';

/**
 * Landing storytelling sections (server components, zero client JS).
 * One repeated pattern keeps the page feeling like a system, not a stack of
 * blocks: eyebrow pill → two-tone heading → short lede → content on a rounded
 * paper card. Only verifiable claims are made here (no invented user counts).
 */

const DOT_GRID: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(color-mix(in srgb, var(--color-ink) 16%, transparent) 1px, transparent 1px)',
  backgroundSize: '20px 20px',
};

function SectionHeading({
  id,
  eyebrow,
  lead,
  accent,
  tail,
  lede,
  align = 'center',
}: {
  id: string;
  eyebrow: string;
  lead: string;
  accent: string;
  tail?: string;
  lede?: string;
  align?: 'center' | 'left';
}) {
  const center = align === 'center';
  return (
    <header className={`flex flex-col gap-3 ${center ? 'items-center text-center' : 'items-start'}`}>
      <span className="inline-flex items-center rounded-full border border-elevated bg-surface px-3.5 py-1.5 text-xs font-semibold text-primary-soft sm:text-[13px]">
        {eyebrow}
      </span>
      <h2
        id={id}
        className="max-w-2xl text-balance text-[1.75rem] font-bold leading-[1.1] tracking-[-0.025em] text-ink sm:text-4xl"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {lead} <span className="text-primary-soft">{accent}</span>
        {tail ? ` ${tail}` : ''}
      </h2>
      {lede && (
        <p className={`max-w-xl text-pretty text-[15px] leading-relaxed text-ink-muted sm:text-base ${center ? '' : 'max-w-md'}`}>
          {lede}
        </p>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------- Flow */

const STEPS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: FileUp, title: 'Drop your PDF', text: 'Pick a file or drag it in. It opens right in your browser.' },
  { icon: WandSparkles, title: 'Auto-whiten', text: 'Dark backgrounds turn white and extra ink is cleaned up.' },
  { icon: LayoutGrid, title: 'Arrange the pages', text: 'Fit up to 10 slides on a sheet, merge files or reorder pages.' },
  { icon: Download, title: 'Download & print', text: 'Save a clean PDF that prints crisp and saves ink.' },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-8 md:gap-10">
      <SectionHeading
        id="how-heading"
        eyebrow="How it works"
        lead="From dark slides to"
        accent="print-ready"
        tail="in four steps"
        lede="No upload, no waiting in a queue. Everything happens on your own device."
      />

      <div
        className="rounded-[28px] border border-surface-2 bg-surface p-5 shadow-[var(--shadow-card)] md:p-10"
        style={DOT_GRID}
      >
        <ol className="flex flex-col items-stretch md:flex-row md:items-stretch">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.title}>
              <li className="relative flex flex-1 flex-col gap-3 rounded-2xl border border-surface-2 bg-bg p-4 shadow-[var(--shadow-card)] md:p-5">
                <span className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-faint">
                    <step.icon className="h-5 w-5 text-primary-soft" aria-hidden="true" />
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-strong text-[13px] font-bold text-white">
                    {i + 1}
                  </span>
                </span>
                <span className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-ink">{step.title}</span>
                <span className="text-sm leading-relaxed text-ink-muted">{step.text}</span>
              </li>
              {i < STEPS.length - 1 && (
                <li aria-hidden="true" className="flex items-center justify-center">
                  <span className="h-7 w-0 border-l-2 border-dashed border-primary/50 md:h-0 md:w-8 md:border-l-0 md:border-t-2" />
                </li>
              )}
            </React.Fragment>
          ))}
        </ol>

        <p className="mx-auto mt-6 flex w-fit max-w-full items-center gap-2 rounded-full border border-elevated bg-bg px-4 py-2 text-center text-[13px] font-semibold text-ink md:mt-8">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
          All four steps run on your device. Nothing is uploaded.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Proof */

function ProofStrip() {
  const facts: Array<{ value: string; label: string; hint: string }> = [
    { value: String(TOOL_REGISTRY.length), label: 'Free tools', hint: 'PDF, images, text and security' },
    { value: '0', label: 'Files uploaded', hint: 'Processing stays on your device' },
    { value: '0', label: 'Accounts needed', hint: 'Open a tool and start' },
    { value: '10', label: 'Slides per sheet', hint: 'Maximum N-up layout' },
  ];
  return (
    <section aria-label="At a glance">
      <dl className="grid grid-cols-2 overflow-hidden rounded-[24px] border border-surface-2 bg-surface shadow-[var(--shadow-card)] md:grid-cols-4">
        {facts.map((f, i) => (
          <div
            key={f.label}
            className={`flex flex-col gap-1 p-5 md:p-7 ${i % 2 === 1 ? 'border-l border-surface-2' : ''} ${i >= 2 ? 'border-t border-surface-2 md:border-t-0' : ''} ${i > 0 ? 'md:border-l md:border-surface-2' : ''}`}
          >
            <dd
              className="order-1 text-4xl font-bold leading-none tracking-[-0.03em] text-ink md:text-5xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {f.value}
              {f.value !== '0' && <span className="text-primary-soft">+</span>}
            </dd>
            <dt className="order-2 mt-2 text-sm font-semibold text-ink">{f.label}</dt>
            <dd className="order-3 text-[13px] leading-snug text-ink-muted">{f.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* --------------------------------------------------------------- Value */

const VALUES: Array<{ icon: LucideIcon; tag: string; title: string; text: string }> = [
  { icon: ShieldCheck, tag: 'On-device', title: 'Private by design', text: 'Your PDFs are processed in your browser and are never sent to a server.' },
  { icon: Droplets, tag: 'Ink saver', title: "Whiten, don't waste toner", text: 'Turn dark backgrounds white so a lecture deck stops printing a black block on every page.' },
  { icon: Layers, tag: 'Paper saver', title: 'Many slides, one sheet', text: 'Fit up to 10 slides on a page and cut paper, binding and printing cost.' },
  { icon: Smartphone, tag: 'Any device', title: 'Works where you study', text: 'Use it on a phone or a laptop, or install it from your browser like an app.' },
];

function ValueCards() {
  return (
    <section aria-labelledby="value-heading" className="flex flex-col gap-8 md:gap-10">
      <SectionHeading
        id="value-heading"
        eyebrow="Why Print Optimizer"
        lead="Made for the printer,"
        accent="private by default."
      />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {VALUES.map((v) => (
          <li
            key={v.title}
            className="flex flex-col gap-3 rounded-2xl border border-surface-2 bg-surface p-5 shadow-[var(--shadow-card)]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-primary-faint">
                <v.icon className="h-5 w-5 text-primary-soft" aria-hidden="true" />
              </span>
              <span className="rounded-full border border-elevated px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">
                {v.tag}
              </span>
            </span>
            <h3 className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-ink">{v.title}</h3>
            <p className="text-sm leading-relaxed text-ink-muted">{v.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------- FAQ */

const FAQS: FaqItem[] = [
  { q: 'Is Print Optimizer free?', a: 'Yes. The tools are free to use and need no account.' },
  { q: 'Do my files leave my device?', a: 'No. Files are processed in your browser on your own device, so nothing is uploaded to a server.' },
  { q: 'Do I need to create an account?', a: 'No. Open a tool and start. There is no sign-up or login.' },
  { q: 'Can I use it on my phone?', a: 'Yes. It is built to work on phones and laptops, and you can install it from the Install button or your browser menu.' },
  { q: 'What does Dark Notes → Print do?', a: 'It turns dark lecture slides into white-background pages that print clearly, and can place several slides on one sheet.' },
];

function LandingFaq() {
  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-14">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <SectionHeading
          id="landing-faq-title"
          align="left"
          eyebrow="FAQ"
          lead="Quick answers,"
          accent="no fine print."
          lede="The short version of how Print Optimizer treats your files."
        />
      </div>
      <FaqAccordion faqs={FAQS} headingId="landing-faq-heading" groupName="landing-faq" />
    </section>
  );
}

/* ------------------------------------------------------------ Closing */

function ClosingCta() {
  return (
    <section
      aria-labelledby="closing-heading"
      className="relative isolate overflow-hidden rounded-[28px] bg-[#28409e] p-7 text-white shadow-[var(--shadow-float)] sm:rounded-[32px] sm:p-12"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 -z-10 h-72 w-72 rounded-full opacity-90 blur-3xl"
        style={{ background: 'radial-gradient(circle, #f2a93c 0%, rgba(242,169,60,0) 70%)' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-40" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }} />
      <div className="flex max-w-xl flex-col items-start gap-4">
        <h2
          id="closing-heading"
          className="text-balance text-[1.85rem] font-bold leading-[1.08] tracking-[-0.025em] sm:text-5xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Print the notes, not the black ink.
        </h2>
        <p className="text-pretty text-[15px] leading-relaxed text-white/85 sm:text-lg">
          Drop a dark PDF and get a clean, print-ready file in seconds. Free, no account, nothing uploaded.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:gap-3">
          <Link
            href={toolHref('dark-print')}
            prefetch={false}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-white px-6 text-[15px] font-bold text-[#1d2d75] transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-h-[52px]"
          >
            Whiten a dark PDF
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
          <a
            href="#tools"
            className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-white/40 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-h-[52px]"
          >
            Browse all tools
          </a>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Export */

export function LandingSections() {
  return (
    <div className="flex flex-col gap-14 pt-6 md:gap-24 md:pt-14">
      <HowItWorks />
      <ProofStrip />
      <ValueCards />
      <LandingFaq />
      <ClosingCta />
    </div>
  );
}

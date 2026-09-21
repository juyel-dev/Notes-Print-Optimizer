'use client';

import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface ToolCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  chips: string[];
  cta: string;
  /** Public tool route — cards are crawlable links, not state buttons. */
  href: string;
  /** True only when the registry has a real addedAt date within the badge window. */
  isNew?: boolean;
}

/**
 * Quiet task card — the tool grid should read as one coherent system, not
 * twelve separate promotional banners. Brand color lives in the icon; the
 * card surface stays neutral so scanning remains easy.
 */
export const ToolCard: React.FC<ToolCardProps> = ({
  title,
  description,
  icon: Icon,
  gradient,
  chips,
  cta,
  href,
  isNew,
}) => (
  <Link
    href={href}
    prefetch={false}
    aria-label={`${title} — ${description}${isNew ? ' — New' : ''}`}
    className="group relative flex min-h-[148px] h-full w-full flex-col rounded-2xl border border-elevated bg-surface/80 p-4 text-left shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface hover:shadow-lg hover:shadow-black/10 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
  >
    {isNew && (
      <span className="absolute right-3 top-3 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-accent">
        New
      </span>
    )}

    <span className="flex items-start justify-between gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md shadow-black/10"
        style={{ backgroundImage: gradient }}
      >
        <Icon className="h-[21px] w-[21px] text-white" aria-hidden="true" />
      </span>

      <span className="inline-flex items-center gap-1 pt-1 text-xs font-bold text-ink-faint transition-colors group-hover:text-primary-soft">
        {cta}
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>

    <span className="mt-3 flex min-w-0 flex-col gap-1">
      <span className="text-sm font-bold leading-tight tracking-[-0.01em] text-ink">
        {title}
      </span>
      <span className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
        {description}
      </span>
    </span>

    {chips.length > 0 && (
      <span className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {chips.slice(0, 2).map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-surface-2/70 px-2 py-0.5 text-[10px] font-semibold text-ink-faint"
          >
            {chip}
          </span>
        ))}
      </span>
    )}
  </Link>
);

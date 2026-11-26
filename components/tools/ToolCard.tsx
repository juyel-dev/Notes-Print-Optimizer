'use client';

import React from 'react';
import Link from 'next/link';
import { Star, type LucideIcon } from 'lucide-react';

export interface ToolCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  chips: string[];
  /** Public tool route — cards are crawlable links, not state buttons. */
  href: string;
  /** True only when the registry has a real addedAt date within the badge window. */
  isNew?: boolean;
  /** Editorial label (e.g. "Top pick"); ignored when `isNew` is true. */
  badge?: string;
}

/**
 * Quiet task card. One consistent icon treatment (primary on a faint well)
 * across all tools, the full description (no clamping), and the specifics as a
 * row of small pills — so the grid scans as one system, not twelve banners.
 */
export const ToolCard: React.FC<ToolCardProps> = ({
  title,
  description,
  icon: Icon,
  chips,
  href,
  isNew,
  badge,
}) => (
  <Link
    href={href}
    prefetch={false}
    className="group relative flex h-full w-full flex-col gap-2.5 rounded-2xl border border-surface-2 bg-surface p-4 text-left sm:gap-3 sm:p-5 transition-[border-color,background-color] duration-200 ease-out hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
  >
    <span className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-primary-faint">
        <Icon className="h-5 w-5 text-primary-soft" aria-hidden="true" />
      </span>
      <span className="min-w-0 text-[17px] font-bold leading-tight tracking-[-0.01em] text-ink">
        {title}
      </span>
      {isNew && (
        <span className="ml-auto shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-accent">
          New
        </span>
      )}
      {!isNew && badge && (
        <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-bg px-2.5 py-0.5 text-[11px] font-bold text-primary-soft shadow-sm">
          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
          {badge}
        </span>
      )}
    </span>

    <span className="line-clamp-2 text-sm leading-relaxed text-ink-muted sm:line-clamp-none">{description}</span>

    {chips.length > 0 && (
      <span className="mt-auto hidden flex-wrap gap-1.5 pt-1 sm:flex">
        {chips.slice(0, 3).map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium leading-none text-ink-muted"
          >
            {chip}
          </span>
        ))}
      </span>
    )}
  </Link>
);

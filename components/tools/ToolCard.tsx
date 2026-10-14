'use client';

import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface ToolCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  chips: string[];
  /** Public tool route — cards are crawlable links, not state buttons. */
  href: string;
  /** True only when the registry has a real addedAt date within the badge window. */
  isNew?: boolean;
}

/**
 * Quiet task card. One consistent icon treatment (primary on a faint well)
 * across all tools, the full description (no clamping), and the specifics as a
 * single mono line — so the grid scans as one system, not twelve banners.
 */
export const ToolCard: React.FC<ToolCardProps> = ({
  title,
  description,
  icon: Icon,
  chips,
  href,
  isNew,
}) => (
  <Link
    href={href}
    prefetch={false}
    aria-label={`${title} — ${description}${isNew ? ' — New' : ''}`}
    className="group relative flex h-full w-full flex-col gap-3 rounded-2xl border border-surface-2 bg-surface p-5 text-left transition-[border-color,background-color] duration-200 ease-out hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
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
    </span>

    <span className="text-sm leading-relaxed text-ink-muted">{description}</span>

    {chips.length > 0 && (
      <span className="mt-auto pt-1 font-mono text-xs text-ink-faint">
        {chips.slice(0, 3).join(' · ')}
      </span>
    )}
  </Link>
);

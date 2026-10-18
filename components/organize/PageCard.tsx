'use client';

import React, { memo, useEffect, useRef } from 'react';
import { Check, RotateCw } from 'lucide-react';
import type { PageItem } from '@/lib/organize/types';
import { isSideways } from '@/lib/organize/types';

export interface PageCardProps {
  item: PageItem;
  position: number;
  /** Thumbnail URL once rendered (null = still loading, undefined for blanks). */
  thumb: string | null;
  /** Page shape for the placeholder (width / height of the SOURCE page, before our rotation). */
  aspect: number;
  selected: boolean;
  dropSide: 'before' | 'after' | null;
  dragging: boolean;
  onToggle: (id: string, e: React.MouseEvent) => void;
  onRotate: (id: string) => void;
  onVisible: (src: number) => void;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';

/** One sheet on the light table. Memoised: a 300-page grid must not re-render on every hover. */
export const PageCard = memo(function PageCard({ item, position, thumb, aspect, selected, dropSide, dragging, onToggle, onRotate, onVisible }: PageCardProps) {
  const ref = useRef<HTMLLIElement>(null);
  const turns = useRef({ last: item.rot as number, cum: item.rot as number });

  // Keep turning the short way round (270° → 0° must not spin backwards through 270°).
  if (turns.current.last !== item.rot) {
    let d = item.rot - turns.current.last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turns.current = { last: item.rot, cum: turns.current.cum + d };
  }

  useEffect(() => {
    if (item.src === null || thumb) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      onVisible(item.src);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onVisible(item.src as number);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item.src, thumb, onVisible]);

  const sideways = isSideways(item.rot);
  const blankAspect = item.w && item.h ? item.w / item.h : 0.707;
  const ar = item.src === null ? blankAspect : aspect;
  const label =
    item.src === null
      ? `Page ${position}, blank page`
      : `Page ${position}, from original page ${item.src + 1}${item.rot ? `, turned ${item.rot} degrees` : ''}${selected ? ', selected' : ''}`;

  return (
    <li
      ref={ref}
      data-page-id={item.id}
      data-drop={dropSide ?? undefined}
      className={`group relative list-none ${dragging ? 'opacity-40' : ''}`}
    >
      {dropSide && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1 z-10 w-1 rounded-full bg-primary-soft shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary-soft)_30%,transparent)] ${dropSide === 'before' ? '-left-1.5' : '-right-1.5'}`}
        />
      )}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        onClick={(e) => onToggle(item.id, e)}
        className={`block w-full rounded-2xl p-2 text-left transition-colors ${FOCUS} ${selected ? 'bg-primary/15 ring-2 ring-primary-soft' : 'hover:bg-surface-2/70'}`}
      >
        <span className="relative flex aspect-square items-center justify-center">
          {item.src === null ? (
            <span
              className="relative flex items-center justify-center rounded-[3px] bg-white shadow-[0_6px_16px_rgba(2,6,23,0.35)]"
              style={sideways ? { height: '100%', aspectRatio: String(ar), maxWidth: '100%' } : ar >= 1 ? { width: '100%', aspectRatio: String(ar) } : { height: '100%', aspectRatio: String(ar) }}
            >
              <span className="text-2xs font-bold uppercase tracking-widest text-slate-400">Blank</span>
            </span>
          ) : thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              draggable={false}
              className="max-h-full max-w-full rounded-[3px] bg-white object-contain shadow-[0_6px_16px_rgba(2,6,23,0.35)] transition-transform duration-300 ease-out"
              style={{ transform: `rotate(${turns.current.cum}deg)` }}
            />
          ) : (
            <span
              className="cp-sheen relative block overflow-hidden rounded-[3px] bg-surface-2"
              style={ar >= 1 ? { width: '100%', aspectRatio: String(ar) } : { height: '100%', aspectRatio: String(ar) }}
            />
          )}
          {selected && (
            <span className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-strong text-white shadow-md">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="mt-2 flex items-baseline justify-center gap-2 px-0.5">
          <span className="text-lg font-black leading-none tabular-nums text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            {position}
          </span>
          <span className="font-mono text-2xs tabular-nums text-ink-faint">{item.src === null ? 'new' : `p${item.src + 1}`}{item.rot ? ` ↻${item.rot}` : ''}</span>
        </span>
      </button>
      <button
        type="button"
        data-no-drag
        aria-label={`Turn page ${position} clockwise`}
        onClick={() => onRotate(item.id)}
        className={`absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-elevated bg-surface/95 text-ink opacity-100 shadow-md transition-opacity hover:bg-surface-2 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS}`}
      >
        <RotateCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
});

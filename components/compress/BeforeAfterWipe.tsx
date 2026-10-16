'use client';

import React, { useCallback, useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

export interface BeforeAfterWipeProps {
  before: string | null;
  after: string | null;
  loading: boolean;
  /** width / height of the page; defaults to A4 portrait. */
  aspect?: number;
}

/**
 * Drag-to-reveal comparison: original on the left of the handle, compressed on the right.
 * Pointer drag + keyboard (←/→/Home/End); vertical touch still scrolls the page.
 */
export const BeforeAfterWipe: React.FC<BeforeAfterWipeProps> = ({ before, after, loading, aspect = 0.707 }) => {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / Math.max(1, r.width)) * 100)));
  }, []);

  const ready = !!before && !!after && !loading;

  return (
    <div
      ref={boxRef}
      className="relative w-full select-none overflow-hidden rounded-2xl border border-surface-2 bg-surface"
      style={{ touchAction: 'pan-y', aspectRatio: String(aspect) }}
      onPointerDown={(e) => {
        if (!ready) return;
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setFromClientX(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && setFromClientX(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {!ready ? (
        <div className="cp-sheen absolute inset-0 flex items-center justify-center overflow-hidden bg-surface-2/60">
          <span className="relative text-sm font-semibold text-ink-muted">Rendering preview…</span>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before!} alt="Original page" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain bg-white" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={after!}
            alt="Compressed page"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full bg-white object-contain"
            style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          />
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider text-white">Original</span>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-accent px-2.5 py-1 text-2xs font-extrabold uppercase tracking-wider text-bg">Compressed</span>
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${pos}%` }} />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Compare original and compressed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={`${Math.round(pos)}% original visible`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
              else if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
              else if (e.key === 'Home') setPos(0);
              else if (e.key === 'End') setPos(100);
              else return;
              e.preventDefault();
            }}
            className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-bg bg-accent text-bg shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
            style={{ left: `${pos}%` }}
          >
            <ChevronsLeftRight className="h-5 w-5" aria-hidden="true" />
          </div>
        </>
      )}
    </div>
  );
};

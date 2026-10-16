import React, { useRef } from 'react';
import { COMPRESS_LEVELS, formatBytes, savedPercent, type CompressLevel } from '@/lib/compress/types';

export interface StrengthLadderProps {
  original: number;
  /** Predicted sizes for levels 1..5, or undefined while loading. */
  sizes: number[] | undefined;
  level: CompressLevel;
  onChange: (l: CompressLevel) => void;
  /** Draws a dashed marker where the target size falls on the scale. */
  target: number | null;
}

/** Five rows, each a bar sized to the predicted result — pick how hard to squeeze by looking, not guessing. */
export const StrengthLadder: React.FC<StrengthLadderProps> = ({ original, sizes, level, onChange, target }) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    let next = level;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(5, level + 1) as CompressLevel;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(1, level - 1) as CompressLevel;
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    else return;
    e.preventDefault();
    onChange(next);
    refs.current[next - 1]?.focus();
  };
  const targetPos = target !== null && original > 0 ? Math.min(100, (target / original) * 100) : null;

  return (
    <div role="radiogroup" aria-label="Compression strength" onKeyDown={onKeyDown} className="flex flex-col gap-2">
      {COMPRESS_LEVELS.map((spec) => {
        const on = spec.level === level;
        const size = sizes?.[spec.level - 1];
        const width = size !== undefined && original > 0 ? Math.max(3, Math.min(100, (size / original) * 100)) : 100;
        const pct = size !== undefined ? savedPercent(original, size) : 0;
        return (
          <button
            key={spec.level}
            ref={(el) => {
              refs.current[spec.level - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(spec.level)}
            className={`group relative flex min-h-[60px] w-full flex-col justify-center gap-1.5 overflow-hidden rounded-2xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft ${
              on ? 'border-accent/60 bg-accent/10' : 'border-surface-2 bg-surface/70 hover:border-elevated hover:bg-surface'
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-extrabold ${on ? 'text-accent-soft' : 'text-ink'}`}>{spec.label}</span>
              <span className="flex items-baseline gap-2 font-mono tabular-nums">
                {size !== undefined ? (
                  <>
                    <span className="text-sm font-semibold text-ink">{formatBytes(size)}</span>
                    {pct > 0 && <span className="text-xs text-ink-faint">−{pct}%</span>}
                  </>
                ) : (
                  <span className="text-sm text-ink-faint">—</span>
                )}
              </span>
            </span>
            <span className="relative block h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span
                className={`block h-full rounded-full transition-[width] duration-500 ease-out ${on ? 'bg-accent' : 'bg-elevated group-hover:bg-ink-faint/60'} ${size === undefined ? 'cp-sheen relative overflow-hidden' : ''}`}
                style={{ width: `${width}%` }}
              />
              {targetPos !== null && <span className="absolute inset-y-[-2px] w-0.5 bg-ink/70" style={{ left: `${targetPos}%` }} />}
            </span>
          </button>
        );
      })}
      {targetPos !== null && (
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          <span aria-hidden="true" className="inline-block h-3.5 w-0.5 bg-ink/70" />
          Target
        </p>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { Target } from 'lucide-react';
import { TARGET_PRESETS, formatBytes, parseTargetInput } from '@/lib/compress/types';

export interface TargetPickerProps {
  target: number | null;
  onChange: (t: number | null) => void;
  /** Smaller on the Studio screen where space is tight. */
  compact?: boolean;
}

/** "Where will you send it?" — limits people actually hit, as ticket-style chips plus a custom size. */
export const TargetPicker: React.FC<TargetPickerProps> = ({ target, onChange, compact }) => {
  const [custom, setCustom] = useState('');
  const [bad, setBad] = useState(false);
  const isPreset = TARGET_PRESETS.some((t) => t.bytes === target);

  const commitCustom = (raw: string) => {
    if (raw.trim() === '') {
      setBad(false);
      if (!isPreset) onChange(null);
      return;
    }
    const bytes = parseTargetInput(raw);
    setBad(bytes === null);
    if (bytes !== null) onChange(bytes);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Target size" className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {TARGET_PRESETS.map((t) => {
          const on = target === t.bytes;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setCustom('');
                setBad(false);
                onChange(on ? null : t.bytes);
              }}
              className={`relative flex min-h-[56px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft ${
                on ? 'border-accent bg-accent/15' : 'border-surface-2 bg-surface/70 hover:border-elevated'
              }`}
            >
              <span className={`font-mono text-sm font-bold tabular-nums ${on ? 'text-accent-soft' : 'text-ink'}`}>≤ {t.label}</span>
              <span className="text-xs text-ink-faint">{t.hint}</span>
              {/* ticket-stub notches */}
              <span aria-hidden="true" className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-bg" />
              <span aria-hidden="true" className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-bg" />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="cp-custom" className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-ink-muted">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          Custom
        </label>
        <input
          id="cp-custom"
          inputMode="decimal"
          value={custom}
          placeholder={target !== null && !isPreset ? formatBytes(target) : 'e.g. 1.5 MB or 800 KB'}
          onChange={(e) => {
            setCustom(e.target.value);
            commitCustom(e.target.value);
          }}
          aria-invalid={bad}
          className={`h-11 min-w-0 flex-1 rounded-xl border bg-surface/80 px-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 ${bad ? 'border-warning' : 'border-elevated focus:border-accent/60'}`}
        />
      </div>
      {bad && <p role="alert" className="text-xs font-semibold text-warning">Try a size between 50 KB and 200 MB, like “2 MB” or “800 KB”.</p>}
    </div>
  );
};

import React from 'react';

/** Two plates squeezing a stack of pages — the visual signature of Compress PDF. */
export const PressIllustration: React.FC<{ className?: string; animated?: boolean }> = ({ className = '', animated = true }) => (
  <svg viewBox="0 0 160 120" role="img" aria-label="A stack of pages being compressed" className={className}>
    <g className={animated ? 'cp-plate-top' : ''}>
      <rect x="14" y="10" width="132" height="14" rx="7" fill="var(--color-accent)" />
      <rect x="74" y="0" width="12" height="12" rx="3" fill="var(--color-accent-soft)" />
    </g>
    <g>
      <rect x="34" y="44" width="92" height="12" rx="3" fill="var(--color-elevated)" />
      <rect x="30" y="54" width="100" height="12" rx="3" fill="var(--color-surface-2)" stroke="var(--color-elevated)" />
      <rect x="34" y="64" width="92" height="12" rx="3" fill="var(--color-elevated)" />
      <rect x="40" y="48" width="48" height="3" rx="1.5" fill="var(--color-ink-faint)" opacity="0.6" />
      <rect x="40" y="58" width="64" height="3" rx="1.5" fill="var(--color-ink-faint)" opacity="0.6" />
    </g>
    <g className={animated ? 'cp-plate-bottom' : ''}>
      <rect x="14" y="96" width="132" height="14" rx="7" fill="var(--color-primary-strong)" />
      <rect x="74" y="108" width="12" height="12" rx="3" fill="var(--color-primary-soft)" />
    </g>
  </svg>
);

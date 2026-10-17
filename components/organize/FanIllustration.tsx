import React from 'react';

/** Three sheets fanned out on the light table — the Organize Pages signature. */
export const FanIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  const sheet = (rot: number, x: number, label: string) => (
    <g transform={`rotate(${rot} ${x + 36} 118)`}>
      <rect x={x} y="18" width="72" height="100" rx="5" fill="#ffffff" stroke="var(--color-elevated)" />
      <rect x={x + 10} y="30" width="34" height="5" rx="2.5" fill="#cbd5e1" />
      <rect x={x + 10} y="42" width="52" height="3.5" rx="1.75" fill="#e2e8f0" />
      <rect x={x + 10} y="51" width="48" height="3.5" rx="1.75" fill="#e2e8f0" />
      <rect x={x + 10} y="60" width="52" height="3.5" rx="1.75" fill="#e2e8f0" />
      <rect x={x + 10} y="69" width="40" height="3.5" rx="1.75" fill="#e2e8f0" />
      <text x={x + 36} y="106" textAnchor="middle" fontSize="12" fontWeight="800" fill="#64748b" fontFamily="ui-sans-serif, system-ui">{label}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 220 136" role="img" aria-label="Pages being put in order" className={className}>
      {sheet(-14, 18, '2')}
      {sheet(14, 130, '3')}
      {sheet(0, 74, '1')}
      <circle cx="110" cy="126" r="4" fill="var(--color-primary-soft)" />
    </svg>
  );
};

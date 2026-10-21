'use client';

import React from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { FOCUS } from './qrConstants';
import type { CornerType } from './qrConstants';

/** Roving-tabindex segmented tabs (←/→/Home/End) shared by both tab rows. */
export function SegTabs<T extends string>(props: {
  label: string;
  idPrefix: string;
  value: T;
  onChange: (v: T) => void;
  items: ReadonlyArray<{ key: T; label: string; icon: React.ElementType }>;
  className?: string;
  btnClass: string;
  panelId?: string;
}) {
  const { label, idPrefix, value, onChange, items, className, btnClass, panelId } = props;
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex((x) => x.key === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].key);
    document.getElementById(`${idPrefix}-${items[next].key}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={className}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            id={`${idPrefix}-${it.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            className={`${btnClass} ${FOCUS} ${active ? 'bg-primary-strong text-white shadow-md shadow-primary/25' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            <it.icon className="h-4 w-4" aria-hidden="true" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stat(props: { label: string; value: string; sub: string; tone: 'good' | 'warn' | 'bad' }) {
  const color = props.tone === 'good' ? 'text-success' : props.tone === 'warn' ? 'text-warning' : 'text-danger';
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-surface-2 bg-bg/60 p-2.5">
      <span className="text-2xs font-bold uppercase tracking-wide text-ink-faint">{props.label}</span>
      <span className={`text-lg font-extrabold tabular-nums leading-tight ${color}`}>{props.value}</span>
      <span className="truncate text-2xs text-ink-faint">{props.sub}</span>
    </div>
  );
}

export function Notice(props: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-snug text-warning">{props.children}</p>
        {props.action && (
          <button type="button" onClick={props.action.onClick} className={`mt-1.5 h-9 rounded-full bg-warning-strong px-3 text-xs font-bold text-white ${FOCUS}`}>
            {props.action.label}
          </button>
        )}
      </div>
    </li>
  );
}

export function Accordion(props: { icon: React.ElementType; title: string; summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const Icon = props.icon;
  return (
    <details open={props.defaultOpen} className="group border-t border-surface-2">
      <summary
        className={`flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 text-ink marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-primary-soft" aria-hidden="true" />
        <span className="text-sm font-bold">{props.title}</span>
        <span className="ml-auto truncate text-xs font-semibold text-ink-faint">{props.summary}</span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-5 pt-1 sm:px-5">{props.children}</div>
    </details>
  );
}

export function ColorField(props: { id: string; label: string; value: string; onChange: (s: string) => void; disabled?: boolean }) {
  return (
    <label
      htmlFor={props.id}
      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-elevated bg-surface-2/60 p-1.5 pr-3 ${props.disabled ? 'opacity-40' : ''}`}
    >
      <input
        id={props.id}
        type="color"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-bold text-ink">{props.label}</span>
        <span className="font-mono text-2xs uppercase text-ink-faint">{props.value}</span>
      </span>
    </label>
  );
}

export function CornerSelect(props: { id: string; label: string; value: CornerType; onChange: (c: CornerType) => void }) {
  return (
    <div>
      <label htmlFor={props.id} className="text-xs font-bold text-ink">
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as CornerType)}
        className="mt-1 h-11 w-full rounded-xl border border-elevated bg-surface-2/60 px-2.5 text-sm font-semibold text-ink focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
      >
        <option value="square">square</option>
        <option value="dot">dot</option>
        <option value="extra-rounded">extra-rounded</option>
      </select>
    </div>
  );
}

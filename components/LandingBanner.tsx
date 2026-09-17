'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, WifiOff, LayoutGrid } from 'lucide-react';
import { TOOL_REGISTRY } from '@/lib/tools/registry';

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: '100% On-Device',
    desc: 'Files never leave your browser',
    href: '/tools/dark-print/',
  },
  {
    icon: WifiOff,
    title: 'Works Fully Offline',
    desc: 'Zero data needed after install',
    href: '/#tools',
  },
  {
    icon: LayoutGrid,
    title: `${TOOL_REGISTRY.length} Free Tools`,
    desc: 'No account, no limits, no fees',
    href: '/#tools',
  },
];

export const LandingBanner: React.FC = () => {
  return (
    <div
      role="region"
      aria-label="Key features"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {TRUST_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.title}
            href={item.href}
            prefetch={false}
            className="group flex items-center gap-3 rounded-xl border border-elevated/70 bg-surface/60 px-3.5 py-2.5 shadow-sm backdrop-blur-xs transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.99]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-soft transition-transform group-hover:scale-105">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink leading-tight">{item.title}</div>
              <div className="text-[11px] text-ink-muted leading-tight truncate">{item.desc}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};


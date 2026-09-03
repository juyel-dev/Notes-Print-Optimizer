'use client';

import React from 'react';
import { ShieldCheck, WifiOff, LayoutGrid } from 'lucide-react';
import { Banner, type BannerSlide } from '@/components/Banner';
import { TOOL_REGISTRY } from '@/lib/tools/registry';

/**
 * Every claim here must be independently checkable by anyone reading the
 * source — no vanity numbers, no "50,000+ students" repeats of what got
 * removed from the hero (see CHANGELOG). Tool count reads from the real
 * registry so it can't go stale as tools are added.
 */
const SLIDES: BannerSlide[] = [
  {
    id: 'on-device',
    icon: ShieldCheck,
    title: '100% On-Device Processing',
    description: 'Every PDF is processed inside your own browser. Nothing is ever uploaded to a server.',
    ctaLabel: 'See how it works',
    href: '/tools/dark-print/',
  },
  {
    id: 'offline',
    icon: WifiOff,
    title: 'Works Fully Offline',
    description: 'Install it once and every tool keeps working with no internet connection at all.',
    ctaLabel: 'Get started',
    href: '/#tools',
  },
  {
    id: 'free-tools',
    icon: LayoutGrid,
    title: `${TOOL_REGISTRY.length} Free Tools — No Sign-up`,
    description: 'Whiten dark slides, merge, split, convert, and more. Every tool is free, with no account required.',
    ctaLabel: 'Browse all tools',
    href: '/#tools',
  },
];

export const LandingBanner: React.FC = () => <Banner slides={SLIDES} />;

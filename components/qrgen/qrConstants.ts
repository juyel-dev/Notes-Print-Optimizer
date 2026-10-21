import type React from 'react';
import { Link2, Mail, Phone, Type, Wifi } from 'lucide-react';

export type Mode = 'text' | 'url' | 'email' | 'wifi' | 'phone';
export type EccKey = 'L' | 'M' | 'Q' | 'H';
export type DotType = 'square' | 'dots' | 'rounded' | 'extra-rounded' | 'classy' | 'classy-rounded';
export type CornerType = 'square' | 'dot' | 'extra-rounded';
export type Flash = 'png' | 'svg' | 'img' | 'fail' | null;

export const MODES: Array<{ key: Mode; label: string; icon: React.ElementType }> = [
  { key: 'text', label: 'Text', icon: Type },
  { key: 'url', label: 'Link', icon: Link2 },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { key: 'phone', label: 'Phone', icon: Phone },
];

export const ECC_META: Record<EccKey, { hint: string; pct: number; desc: string }> = {
  L: { hint: '~7%', pct: 7, desc: 'Most data, fragile' },
  M: { hint: '~15%', pct: 15, desc: 'Balanced' },
  Q: { hint: '~25%', pct: 25, desc: 'Durable' },
  H: { hint: '~30%', pct: 30, desc: 'Toughest' },
};

/** Max payload bytes per ECC level for a version-40 QR (byte mode). */
export const ECC_CAPACITY: Record<EccKey, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

export const EXAMPLES: Record<Mode, string[]> = {
  text: ['Hello — Print Optimizer', 'Scan me 👋 offline forever'],
  url: ['https://print-optimizer.vercel.app', 'https://example.com/menu'],
  email: ['hello@example.com'],
  wifi: ['MyCafe-WiFi'],
  phone: ['+8801XXXXXXXXX'],
};

export const SIZE_PRESETS = [256, 512, 1024] as const;
export const DEFAULT_DARK = '#0f172a';
export const DEFAULT_LIGHT = '#ffffff';
export const DEFAULT_GRADIENT_END = '#3654d9';
export const COLOR_SWATCHES = [
  { d: '#0f172a', l: '#ffffff', label: 'Ink' },
  { d: '#1e3a5f', l: '#f0f9ff', label: 'Navy' },
  { d: '#0f766e', l: '#f0fdfa', label: 'Teal' },
  { d: '#28409e', l: '#eef2ff', label: 'Cobalt' },
  { d: '#7a4808', l: '#fff7e6', label: 'Marigold' },
] as const;
export const DOT_TYPES: DotType[] = ['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';
export const CARD = 'rounded-2xl border border-surface-2 bg-surface/90 shadow-lg';
export const FIELD =
  'w-full rounded-xl border border-elevated bg-surface-2/60 px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25';
export const CHIP_BTN =
  'inline-flex h-10 items-center gap-1.5 rounded-full border border-elevated bg-surface px-3.5 text-xs font-bold text-ink-muted transition hover:bg-surface-2 hover:text-ink active:scale-[0.98]';
export const RANGE =
  'mt-2 w-full cursor-pointer appearance-none rounded-full bg-elevated py-2 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary-strong [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary-strong';

import type { ViewportSize } from '@playwright/test';

export const PAGE_IDS = [
  'home',
  'dark-print',
  'enhance-light-pdf',
  'protect-pdf',
  'pdf-to-images',
  'merge-pdf',
  'split-pdf',
  'image-to-pdf',
  'password-generator',
  'qr-generator',
  'word-counter',
  'case-converter',
  'n-up',
  'compress-pdf',
  'organize-pages',
] as const;

export type PageId = (typeof PAGE_IDS)[number];
export type Theme = 'light' | 'dark';

export interface CaptureViewport {
  name: 'desktop' | 'mobile';
  width: number;
  height: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Start the dedicated Screenshot Generation workflow with explicit selections.`);
  }
  return value;
}

function resolvePages(raw: string): PageId[] {
  if (raw.toLowerCase() === 'all') return [...PAGE_IDS];

  const requested = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  if (requested.length === 0) {
    throw new Error('Select at least one page ID, or use "all". No screenshots will be generated.');
  }

  const invalid = requested.filter((value) => !PAGE_IDS.includes(value as PageId));
  if (invalid.length > 0) {
    throw new Error(`Unknown screenshot page ID(s): ${invalid.join(', ')}. Valid IDs: ${PAGE_IDS.join(', ')}.`);
  }

  const selected = new Set(requested as PageId[]);
  return PAGE_IDS.filter((pageId) => selected.has(pageId));
}

function resolveThemes(raw: string): Theme[] {
  switch (raw.toLowerCase()) {
    case 'light':
      return ['light'];
    case 'dark':
      return ['dark'];
    case 'both':
      return ['light', 'dark'];
    default:
      throw new Error(`Invalid SCREENSHOT_THEME "${raw}". Use light, dark, or both.`);
  }
}

function resolveViewports(raw: string): CaptureViewport[] {
  const all: CaptureViewport[] = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  switch (raw.toLowerCase()) {
    case 'desktop':
      return [all[0]];
    case 'mobile':
      return [all[1]];
    case 'both':
      return all;
    default:
      throw new Error(`Invalid SCREENSHOT_VIEWPORT "${raw}". Use desktop, mobile, or both.`);
  }
}

if (process.env.SCREENSHOT_ENABLED !== 'true') {
  throw new Error('Screenshot generation is disabled. Enable it explicitly in the Screenshot Generation workflow.');
}

export const SELECTED_PAGE_IDS = resolvePages(requiredEnv('SCREENSHOT_PAGE_IDS'));
export const THEMES = resolveThemes(requiredEnv('SCREENSHOT_THEME'));
export const VIEWPORTS = resolveViewports(requiredEnv('SCREENSHOT_VIEWPORT'));

export function isPageSelected(pageId: PageId): boolean {
  return SELECTED_PAGE_IDS.includes(pageId);
}

export function isToolPage(pageId: PageId): boolean {
  return pageId !== 'home' && pageId !== 'dark-print';
}

export function viewportSize(viewport: CaptureViewport): ViewportSize {
  return { width: viewport.width, height: viewport.height };
}

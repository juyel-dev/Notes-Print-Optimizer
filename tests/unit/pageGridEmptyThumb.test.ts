/**
 * A page whose thumbnail generation failed (empty thumbnailDataUrl) must
 * render an honest placeholder — never a broken `<img src="">`. A page with
 * a real thumbnail must keep rendering its image.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageGrid } from '@/components/PageGrid';
import type { ProcessedPage } from '@/lib/optimizer/types';

class MockIntersectionObserver {
  private cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

const page = (pageIndex: number, thumbnailDataUrl: string): ProcessedPage =>
  ({
    pageIndex,
    thumbnailDataUrl,
    inkCoverageBeforePct: 8,
    inkCoverageAfterPct: 8,
    width: 800,
    height: 1000,
  }) as ProcessedPage;

describe('PageGrid empty-thumbnail placeholder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows a placeholder instead of a broken image when the thumbnail is missing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          React.createElement(PageGrid, {
            pages: [page(0, ''), page(1, 'blob:real-thumb')],
            selectedPageIndex: 0,
            onSelectPage: vi.fn(),
            excludedPages: new Set<number>(),
            onToggleExcludePage: vi.fn(),
            keepOriginalPages: new Set<number>(),
            onToggleKeepOriginalPage: vi.fn(),
            manualWhiteBoxRegions: {},
            onEditPage: vi.fn(),
          }),
        );
      });

      // No broken image anywhere…
      expect(host.querySelector('img[src=""]')).toBeNull();
      // …the failed page gets the honest placeholder…
      expect(
        host.querySelector('[aria-label="Preview unavailable for page 1 — export still works"]'),
      ).not.toBeNull();
      // …and the healthy page still shows its image.
      const img = host.querySelector('img[alt="Slide 2"]');
      expect(img?.getAttribute('src')).toBe('blob:real-thumb');
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});

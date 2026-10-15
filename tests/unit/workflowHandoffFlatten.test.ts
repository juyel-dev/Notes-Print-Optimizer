/**
 * Regression test for the Enhance -> Layout handoff dead end: arriving at
 * Phase 3 via handoff bypasses Phase 2's "Choose Layout" button, so nothing
 * ever kicked off page preparation and the layout step spun on
 * "Preparing pages for layout…" forever. WorkflowView must auto-start the
 * flatten exactly once on handoff arrival — and never in the normal flow.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowView } from '@/components/views/WorkflowView';
import type {
  WorkflowActions,
  WorkflowHandlers,
  WorkflowState,
} from '@/components/views/types';
import type { ProcessedPage } from '@/lib/optimizer/types';
import { PdfExporter } from '@/lib/optimizer/pdfExporter';

vi.mock('@/lib/optimizer/pdfExporter', () => ({
  PdfExporter: {
    flattenActivePagesToPdf: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 2,
    }),
  },
}));

vi.mock('@/components/layout/PrintLayoutStep', () => ({
  PrintLayoutStep: () => null,
}));

const flattenSpy = vi.mocked(PdfExporter.flattenActivePagesToPdf);

const handoffPage = (pageIndex: number): ProcessedPage =>
  ({
    pageIndex,
    inkCoverageBeforePct: 8,
    inkCoverageAfterPct: 8,
  }) as ProcessedPage;

function buildProps(overrides: {
  enhanceHandoffActive?: boolean;
  pages?: ProcessedPage[];
} = {}) {
  const { enhanceHandoffActive = true, pages = [handoffPage(0), handoffPage(1)] } = overrides;
  const state = {
    currentPhase: 3,
    isProcessing: false,
    progress: null,
    errorMessage: null,
    uploadedItems: [],
    mergedPdfBlob: null,
    mergedPdfBytes: null,
    mergedPageDataUrls: [],
    processedPages: pages,
    selectedPageIndex: 0,
    excludedPages: new Set<number>(),
    keepOriginalPages: new Set<number>(),
    manualWhiteBoxRegions: {},
    docProfile: null,
    masterParams: {},
    processingToggles: {},
    isPreviewProcessing: false,
    layoutConfig: {},
    layoutDirty: false,
    finalSheetPreviews: [],
    finalMetrics: null,
    finalPrintPdfBlob: null,
    rating: 0,
    feedbackText: '',
    feedbackSubmitted: false,
  } as unknown as WorkflowState;
  const actions = {
    setPhase: vi.fn(),
    setError: vi.fn(),
    setSelectedPageIndex: vi.fn(),
    setMasterParams: vi.fn(),
    setProcessingToggles: vi.fn(),
    setExcludedPages: vi.fn(),
    setRating: vi.fn(),
    setFeedbackText: vi.fn(),
  } as WorkflowActions;
  const handlers = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        return vi.fn();
      },
    },
  ) as unknown as WorkflowHandlers;
  return {
    state,
    actions,
    handlers,
    onToolModeChange: vi.fn(),
    enhanceHandoffActive,
    onBackToEnhance: vi.fn(),
  };
}

async function renderAndSettle(props: ReturnType<typeof buildProps>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(WorkflowView, props));
  });
  for (let i = 0; i < 20 && flattenSpy.mock.calls.length === 0; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
  // One last flush for the flatten resolution -> setState commit.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
  return { host, root };
}

describe('WorkflowView handoff auto-flatten', () => {
  afterEach(() => {
    flattenSpy.mockClear();
    document.body.innerHTML = '';
  });

  it('starts page preparation once when arriving at Phase 3 via handoff', async () => {
    const { root } = await renderAndSettle(buildProps());
    try {
      expect(flattenSpy).toHaveBeenCalledTimes(1);
      const [activePages] = flattenSpy.mock.calls[0];
      expect(activePages).toHaveLength(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('does not start preparation in the normal flow (flag off)', async () => {
    const { root } = await renderAndSettle(
      buildProps({ enhanceHandoffActive: false }),
    );
    try {
      expect(flattenSpy).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('does not start preparation when there are no pages', async () => {
    const { root } = await renderAndSettle(buildProps({ pages: [] }));
    try {
      expect(flattenSpy).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});

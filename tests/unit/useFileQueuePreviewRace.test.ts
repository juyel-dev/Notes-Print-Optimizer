import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadService, type UploadedItem } from '../../lib/services/UploadService';
import { memoryManager } from '../../lib/optimizer/memoryManager';
import { useFileQueue } from '../../lib/workflow/hooks/useFileQueue';
import type { WorkflowActions } from '../../lib/workflow/useWorkflow';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useFileQueue merged preview ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a slower stale preview and only revokes old thumbnails after a replacement is ready', async () => {
    type Preview = Awaited<ReturnType<typeof UploadService.mergeAndPreview>>;
    const first = deferred<Preview>();
    const second = deferred<Preview>();
    const mergeSpy = vi.spyOn(UploadService, 'mergeAndPreview')
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const revokeSpy = vi.spyOn(memoryManager, 'revokeBlobUrl').mockImplementation(() => {});
    const actions = {
      setUploadedItems: vi.fn(),
      setMergeResult: vi.fn(),
      setError: vi.fn(),
    } as unknown as WorkflowActions;

    const items = [
      { id: 'first', name: 'first.pdf' },
      { id: 'second', name: 'second.pdf' },
    ] as UploadedItem[];
    let queue!: ReturnType<typeof useFileQueue>;
    const host = document.createElement('div');
    const root = createRoot(host);
    const oldThumbs = ['blob:existing-preview'];

    function Harness() {
      queue = useFileQueue({
        uploadedItems: items,
        mergedPdfBlob: new Blob(['old-pdf']),
        mergedPageDataUrls: oldThumbs,
        actions,
        withProcessing: vi.fn() as never,
        clearProgressiveThumbnails: vi.fn(),
      });
      return null;
    }

    const preview = (n: number, url: string): NonNullable<Preview> => ({
      pdfBlob: new Blob([String(n)], { type: 'application/pdf' }),
      pdfBytes: new Uint8Array([n]),
      thumbnails: [url],
    });

    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });

      const olderRequest = queue.handleMoveItem(0, 'DOWN');
      const newerRequest = queue.handleMoveItem(0, 'DOWN');

      // While rebuilding, the old Blob download is invalidated but thumbnails
      // stay visible until a valid preview for the new queue order is ready.
      expect(actions.setMergeResult).toHaveBeenNthCalledWith(1, null, null, oldThumbs);
      expect(actions.setMergeResult).toHaveBeenNthCalledWith(2, null, null, oldThumbs);
      expect(revokeSpy).not.toHaveBeenCalledWith('blob:existing-preview');

      second.resolve(preview(2, 'blob:newer-preview'));
      await act(async () => { await newerRequest; });

      first.resolve(preview(1, 'blob:stale-preview'));
      await act(async () => { await olderRequest; });

      expect(mergeSpy).toHaveBeenCalledTimes(2);
      expect(actions.setMergeResult).toHaveBeenLastCalledWith(
        expect.any(Blob),
        new Uint8Array([2]),
        ['blob:newer-preview'],
      );
      expect(revokeSpy).toHaveBeenCalledWith('blob:existing-preview');
      expect(revokeSpy).toHaveBeenCalledWith('blob:stale-preview');
      expect(actions.setError).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); });
    }
  });

  it('keeps the old thumbnails and reports an error if replacement preview generation fails', async () => {
    const oldThumbs = ['blob:still-visible'];
    vi.spyOn(UploadService, 'mergeAndPreview').mockRejectedValue(new Error('PDF decode failed'));
    const revokeSpy = vi.spyOn(memoryManager, 'revokeBlobUrl').mockImplementation(() => {});
    const actions = {
      setUploadedItems: vi.fn(),
      setMergeResult: vi.fn(),
      setError: vi.fn(),
    } as unknown as WorkflowActions;
    const items = [
      { id: 'first', name: 'first.pdf' },
      { id: 'second', name: 'second.pdf' },
    ] as UploadedItem[];
    let queue!: ReturnType<typeof useFileQueue>;
    const host = document.createElement('div');
    const root = createRoot(host);

    function Harness() {
      queue = useFileQueue({
        uploadedItems: items,
        mergedPdfBlob: new Blob(['old-pdf']),
        mergedPageDataUrls: oldThumbs,
        actions,
        withProcessing: vi.fn() as never,
        clearProgressiveThumbnails: vi.fn(),
      });
      return null;
    }

    try {
      await act(async () => {
        root.render(React.createElement(Harness));
      });
      await act(async () => {
        await queue.handleMoveItem(0, 'DOWN');
      });

      expect(actions.setMergeResult).toHaveBeenCalledTimes(1);
      expect(actions.setMergeResult).toHaveBeenCalledWith(null, null, oldThumbs);
      expect(revokeSpy).not.toHaveBeenCalledWith('blob:still-visible');
      expect(actions.setError).toHaveBeenCalledWith(
        'Could not rebuild the merged PDF preview. Your previous thumbnails are still available; try again.',
      );
    } finally {
      await act(async () => { root.unmount(); });
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { settleThumbnailSession } from '../../lib/optimizer/engine/v2/thumbnailSession';

describe('thumbnail processing sessions', () => {
  it('preserves the previous successful thumbnails and revokes partial URLs on failure', () => {
    const previous = new Set(['blob:old-page-1', 'blob:old-page-2']);
    const active = new Set([...previous, 'blob:partial-page-1', 'blob:partial-page-2']);
    const revoke = vi.fn();

    settleThumbnailSession(active, previous, false, revoke);

    expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual([
      'blob:partial-page-1',
      'blob:partial-page-2',
    ]);
    expect(Array.from(active).sort()).toEqual(Array.from(previous).sort());
  });

  it('replaces the old thumbnail set only after a complete successful run', () => {
    const previous = new Set(['blob:old-page-1', 'blob:old-page-2']);
    const active = new Set([...previous, 'blob:new-page-1', 'blob:new-page-2']);
    const revoke = vi.fn();

    settleThumbnailSession(active, previous, true, revoke);

    expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual([
      'blob:old-page-1',
      'blob:old-page-2',
    ]);
    expect(Array.from(active).sort()).toEqual(['blob:new-page-1', 'blob:new-page-2']);
  });
});

import { describe, expect, it } from 'vitest';
import { createCachePdfId } from '../../lib/optimizer/cacheIds';

describe('createCachePdfId', () => {
  it('keeps cache IDs distinct for immediate runs with the same prefix', () => {
    const ids = Array.from({ length: 100 }, () => createCachePdfId('pw_doc'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('pw_doc_'))).toBe(true);
  });
});

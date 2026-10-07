import { describe, expect, it } from 'vitest';
import { estimateRemainingMs, formatDuration } from '../../components/ProcessingModal';
import type { ProcessingProgress } from '../../lib/optimizer/types';

const base: ProcessingProgress = {
  stage: 'OPTIMIZING',
  currentPage: 10,
  totalPages: 100,
  percent: 10,
  currentAction: '',
  elapsedMs: 5000,
};

describe('formatDuration', () => {
  it('uses whole seconds under a minute and m ss above', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(1499)).toBe('1s');
    expect(formatDuration(59_400)).toBe('59s');
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(600_000)).toBe('10m 00s');
  });
  it('never goes negative', () => {
    expect(formatDuration(-5000)).toBe('0s');
  });
});

describe('estimateRemainingMs', () => {
  it('extrapolates the real per-page average', () => {
    // 5s for 10 pages -> 0.5s/page -> 90 pages left = 45s
    expect(estimateRemainingMs(base)).toBe(45_000);
  });
  it('is withheld until 3 pages are done', () => {
    expect(estimateRemainingMs({ ...base, currentPage: 2 })).toBeNull();
  });
  it('is withheld without a known total, without elapsed time, and when finished', () => {
    expect(estimateRemainingMs({ ...base, totalPages: 0 })).toBeNull();
    expect(estimateRemainingMs({ ...base, elapsedMs: 0 })).toBeNull();
    expect(estimateRemainingMs({ ...base, currentPage: 100 })).toBeNull();
  });
});

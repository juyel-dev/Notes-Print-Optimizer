import { describe, expect, it } from 'vitest';
import { cleanActionText, estimateRemainingMs, formatDuration } from '../../components/ProcessingModal';
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

describe('cleanActionText', () => {
  it('strips the internal engine tag and keeps the message', () => {
    expect(cleanActionText('[V2] Rendering page 3/4')).toBe('Rendering page 3/4');
    expect(cleanActionText('[V2]Completed page 1/4')).toBe('Completed page 1/4');
  });
  it('leaves normal text and empty input alone', () => {
    expect(cleanActionText('Merging PDFs')).toBe('Merging PDFs');
    expect(cleanActionText('Page [2] done')).toBe('Page [2] done');
    expect(cleanActionText(undefined)).toBe('');
  });
});

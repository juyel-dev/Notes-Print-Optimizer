import { describe, expect, it } from 'vitest';
import {
  COMPRESS_LEVELS,
  TARGET_PRESETS,
  evenSample,
  formatBytes,
  parseTargetInput,
  pickLevelForTarget,
  savedPercent,
} from '@/lib/compress/types';
import { compressReducer, INITIAL_COMPRESS_STATE, type CompressState } from '@/lib/compress/compressReducer';
import { monotonic } from '@/lib/compress/compressService';
import { friendlyOpenError, recommend } from '@/lib/compress/analyze';

const MB = 1024 * 1024;
const analysis = {
  fileBytes: 20 * MB,
  pageCount: 40,
  textPageRatio: 0,
  imageCount: 40,
  eligibleBytes: 19 * MB,
  eligibleShare: 0.95,
  recommendedMode: 'smart' as const,
  reason: 'x',
};

describe('levels + formatting', () => {
  it('has five strictly stronger levels', () => {
    expect(COMPRESS_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < 5; i++) {
      expect(COMPRESS_LEVELS[i].smart.quality).toBeLessThan(COMPRESS_LEVELS[i - 1].smart.quality);
      expect(COMPRESS_LEVELS[i].smart.maxEdge).toBeLessThan(COMPRESS_LEVELS[i - 1].smart.maxEdge);
      expect(COMPRESS_LEVELS[i].flatten.dpi).toBeLessThan(COMPRESS_LEVELS[i - 1].flatten.dpi);
    }
  });
  it('formats sizes consistently', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(812 * 1024)).toBe('812 KB');
    expect(formatBytes(1.84 * MB)).toBe('1.8 MB');
    expect(formatBytes(240 * MB)).toBe('240 MB');
    expect(formatBytes(NaN)).toBe('—');
  });
  it('savedPercent never claims 100% or negative', () => {
    expect(savedPercent(10, 2)).toBe(80);
    expect(savedPercent(10, 0)).toBe(99);
    expect(savedPercent(10, 12)).toBe(0);
    expect(savedPercent(0, 0)).toBe(0);
  });
});

describe('pickLevelForTarget', () => {
  const sizes = [9 * MB, 6 * MB, 4 * MB, 2.5 * MB, 1.5 * MB];
  it('chooses the gentlest level that fits with a safety margin', () => {
    expect(pickLevelForTarget(sizes, 10 * MB)).toEqual({ level: 1, reachable: true });
    expect(pickLevelForTarget(sizes, 5 * MB)).toEqual({ level: 3, reachable: true });
    expect(pickLevelForTarget(sizes, 4 * MB).level).toBe(4); // 4 MB * 1.03 > 4 MB, so one step stronger
  });
  it('reports unreachable targets honestly and falls back to Extreme', () => {
    expect(pickLevelForTarget(sizes, 1 * MB)).toEqual({ level: 5, reachable: false });
  });
  it('target presets are ascending', () => {
    const b = TARGET_PRESETS.map((t) => t.bytes);
    expect([...b].sort((x, y) => x - y)).toEqual(b);
  });
});

describe('parseTargetInput', () => {
  it('reads sizes with or without units', () => {
    expect(parseTargetInput('2')).toBe(2 * MB);
    expect(parseTargetInput('1.5 mb')).toBe(Math.round(1.5 * MB));
    expect(parseTargetInput('800kb')).toBe(800 * 1024);
    expect(parseTargetInput('1,5')).toBe(Math.round(1.5 * MB));
  });
  it('rejects nonsense and out-of-range values', () => {
    expect(parseTargetInput('')).toBeNull();
    expect(parseTargetInput('abc')).toBeNull();
    expect(parseTargetInput('0')).toBeNull();
    expect(parseTargetInput('10 kb')).toBeNull();
    expect(parseTargetInput('999 mb')).toBeNull();
  });
});

describe('evenSample + monotonic', () => {
  it('returns every index when small and spreads evenly when large', () => {
    expect(evenSample(3, 8)).toEqual([0, 1, 2]);
    const s = evenSample(100, 8);
    expect(s).toHaveLength(8);
    expect(s[0]).toBe(0);
    expect(s[7]).toBe(99);
    expect(evenSample(0, 8)).toEqual([]);
  });
  it('predictions never grow with strength or exceed the original', () => {
    expect(monotonic([5, 7, 4, 9, 3], 6)).toEqual([5, 5, 4, 4, 3]);
  });
});

describe('recommend + errors', () => {
  it('Keep text when images dominate, Flatten when they do not', () => {
    expect(recommend(20 * MB, 18 * MB, 0).mode).toBe('smart');
    expect(recommend(20 * MB, 1 * MB, 1).mode).toBe('flatten');
    expect(recommend(100 * 1024, 0, 1).mode).toBe('smart');
  });
  it('explains password and damaged files by name', () => {
    expect(friendlyOpenError({ name: 'EncryptedPDFError' }, 'a.pdf').message).toMatch(/"a\.pdf" is password-protected/);
    expect(friendlyOpenError(new Error('boom'), 'b.pdf').message).toMatch(/"b\.pdf" looks damaged/);
  });
});

describe('compressReducer', () => {
  const studio = (): CompressState =>
    compressReducer(compressReducer(INITIAL_COMPRESS_STATE, { type: 'ANALYZE_START', source: { name: 'n.pdf', baseName: 'n', size: 20 * MB } }), {
      type: 'ANALYZE_DONE',
      analysis,
    });

  it('moves upload → analyzing → studio and adopts the recommended mode', () => {
    const s = studio();
    expect(s.step).toBe('studio');
    expect(s.mode).toBe('smart');
    expect(compressReducer(INITIAL_COMPRESS_STATE, { type: 'ANALYZE_START', source: s.source! }).step).toBe('analyzing');
  });

  it('keeps a target chosen before the file was dropped', () => {
    const s0 = compressReducer(INITIAL_COMPRESS_STATE, { type: 'SET_TARGET', target: 2 * MB });
    const s1 = compressReducer(s0, { type: 'ANALYZE_START', source: { name: 'n.pdf', baseName: 'n', size: 1 } });
    expect(s1.target).toBe(2 * MB);
    expect(compressReducer(s1, { type: 'RESET' }).target).toBeNull();
  });

  it('a target picks the level from predictions, whichever arrives first', () => {
    const sizes = [9 * MB, 6 * MB, 4 * MB, 2.5 * MB, 1.5 * MB];
    let s = compressReducer(studio(), { type: 'SET_TARGET', target: 5 * MB });
    s = compressReducer(s, { type: 'ESTIMATE_DONE', mode: 'smart', sizes });
    expect(s.level).toBe(3);
    let t = compressReducer(studio(), { type: 'ESTIMATE_DONE', mode: 'smart', sizes });
    t = compressReducer(t, { type: 'SET_TARGET', target: 7 * MB });
    expect(t.level).toBe(2);
  });

  it('choosing a strength by hand clears the target', () => {
    let s = compressReducer(studio(), { type: 'SET_TARGET', target: 2 * MB });
    s = compressReducer(s, { type: 'SET_LEVEL', level: 4 });
    expect(s.target).toBeNull();
    expect(s.level).toBe(4);
  });

  it('switching mode re-picks the level for the target and keeps both modes\' estimates', () => {
    const smart = [9 * MB, 8 * MB, 7 * MB, 6 * MB, 5.5 * MB];
    const flat = [6 * MB, 4 * MB, 2 * MB, 1.2 * MB, 0.8 * MB];
    let s = compressReducer(studio(), { type: 'ESTIMATE_DONE', mode: 'smart', sizes: smart });
    s = compressReducer(s, { type: 'ESTIMATE_DONE', mode: 'flatten', sizes: flat });
    s = compressReducer(s, { type: 'SET_TARGET', target: 3 * MB });
    expect(s.level).toBe(5); // smart can't reach it → Extreme
    s = compressReducer(s, { type: 'SET_MODE', mode: 'flatten' });
    expect(s.level).toBe(3);
    expect(Object.keys(s.estimates)).toEqual(['smart', 'flatten']);
  });

  it('run lifecycle: working → done, cancel returns to studio, errors surface', () => {
    let s = compressReducer(studio(), { type: 'RUN_START' });
    expect(s.step).toBe('working');
    expect(compressReducer(s, { type: 'RUN_CANCEL' }).step).toBe('studio');
    s = compressReducer(s, {
      type: 'RUN_DONE',
      result: { blob: new Blob(['x']), size: 1, mode: 'smart', level: 3, unchanged: false, target: null, reachedTarget: null, attempts: 1 },
    });
    expect(s.step).toBe('done');
    expect(compressReducer(s, { type: 'BACK_TO_STUDIO' }).result).toBeNull();
    expect(compressReducer(s, { type: 'ERROR', error: 'bad', step: 'upload' })).toMatchObject({ step: 'upload', error: 'bad' });
    expect(compressReducer(s, { type: 'RESET' })).toEqual(INITIAL_COMPRESS_STATE);
  });
});

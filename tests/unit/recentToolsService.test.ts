import { describe, expect, it, beforeEach } from 'vitest';
import { recordToolVisit, getRecentToolIds } from '../../lib/services/RecentToolsService';

describe('RecentToolsService', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty list when nothing has been visited', () => {
    expect(getRecentToolIds()).toEqual([]);
  });

  it('records a visit and returns it', () => {
    recordToolVisit('dark-print');
    expect(getRecentToolIds()).toEqual(['dark-print']);
  });

  it('orders most-recently-visited first', () => {
    recordToolVisit('dark-print');
    recordToolVisit('merge');
    expect(getRecentToolIds()).toEqual(['merge', 'dark-print']);
  });

  it('deduplicates: revisiting a tool moves it to the front instead of adding a second entry', () => {
    recordToolVisit('dark-print');
    recordToolVisit('merge');
    recordToolVisit('dark-print');
    expect(getRecentToolIds()).toEqual(['dark-print', 'merge']);
  });

  it('caps the list at 3 entries, dropping the oldest', () => {
    recordToolVisit('dark-print');
    recordToolVisit('merge');
    recordToolVisit('split');
    recordToolVisit('enhance');
    const ids = getRecentToolIds();
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(['enhance', 'split', 'merge']);
    expect(ids).not.toContain('dark-print');
  });

  it('does not throw and returns an empty list when localStorage contains malformed JSON', () => {
    window.localStorage.setItem('po:recent-tools', '{not valid json');
    expect(() => getRecentToolIds()).not.toThrow();
    expect(getRecentToolIds()).toEqual([]);
  });

  it('does not throw and returns an empty list when localStorage contains a non-array value', () => {
    window.localStorage.setItem('po:recent-tools', '{"id":"dark-print"}');
    expect(getRecentToolIds()).toEqual([]);
  });
});

import type { ToolMode } from '../enhance/types';

const STORAGE_KEY = 'po:recent-tools';
const MAX_ENTRIES = 3;

interface RecentToolEntry {
  id: ToolMode;
  visitedAt: number;
}

function safeParse(raw: string | null): RecentToolEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentToolEntry => typeof e?.id === 'string' && typeof e?.visitedAt === 'number',
    );
  } catch {
    return [];
  }
}

/** Records a tool visit, most-recent-first, deduplicated, capped at MAX_ENTRIES. */
export function recordToolVisit(id: ToolMode): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = safeParse(window.localStorage.getItem(STORAGE_KEY));
    const withoutCurrent = existing.filter((e) => e.id !== id);
    const next = [{ id, visitedAt: Date.now() }, ...withoutCurrent].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — silently skip.
  }
}

/** Most-recent-first list of tool ids the user has actually opened. */
export function getRecentToolIds(): ToolMode[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY)).map((e) => e.id);
}

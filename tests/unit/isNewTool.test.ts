import { describe, expect, it } from 'vitest';
import { isNewTool, type ToolDefinition } from '../../lib/tools/registry';
import { FileText } from 'lucide-react';

function makeTool(addedAt?: string): ToolDefinition {
  return {
    id: 'dark-print',
    slug: 'dark-print',
    title: 'Test Tool',
    seoTitle: 'Test Tool',
    seoDescription: 'Test',
    description: 'Test',
    aliases: [],
    keywords: [],
    category: 'pdf',
    icon: FileText,
    gradient: '',
    chips: [],
    cta: '',
    addedAt,
  };
}

describe('isNewTool', () => {
  const now = new Date('2026-09-01T00:00:00Z');

  it('is false when addedAt is not set at all', () => {
    expect(isNewTool(makeTool(undefined), now)).toBe(false);
  });

  it('is true for a tool added today', () => {
    expect(isNewTool(makeTool('2026-09-01'), now)).toBe(true);
  });

  it('is true for a tool added 29 days ago (inside the 30-day window)', () => {
    expect(isNewTool(makeTool('2026-08-03'), now)).toBe(true);
  });

  it('is false for a tool added 31 days ago (outside the window)', () => {
    expect(isNewTool(makeTool('2026-08-01'), now)).toBe(false);
  });

  it('is false for a malformed date string, not a thrown error', () => {
    expect(isNewTool(makeTool('not-a-date'), now)).toBe(false);
  });

  it('is false for a future date (clock skew / bad data), not true', () => {
    expect(isNewTool(makeTool('2026-12-25'), now)).toBe(false);
  });
});

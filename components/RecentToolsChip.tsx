'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { getRecentToolIds } from '@/lib/services/RecentToolsService';
import { getToolById, toolHref, type ToolDefinition } from '@/lib/tools/registry';

/**
 * Reads localStorage, so it must render nothing during SSR/first paint and
 * only populate after mount — otherwise server and client markup mismatch.
 * Renders nothing at all for first-time visitors (no history yet); this is
 * not a feature that needs an empty state, it should just not exist yet.
 */
export const RecentToolsChip: React.FC = () => {
  const [tools, setTools] = useState<ToolDefinition[] | null>(null);

  useEffect(() => {
    const ids = getRecentToolIds();
    const resolved = ids.map(getToolById).filter((t): t is ToolDefinition => Boolean(t));
    setTools(resolved);
  }, []);

  if (!tools || tools.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1" aria-label="Continue where you left off">
      <span className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        Continue:
      </span>
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <Link
            key={tool.id}
            href={toolHref(tool.id)}
            prefetch={false}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-elevated bg-surface px-3 text-xs font-bold text-ink transition-colors hover:border-primary/40 hover:text-primary-soft"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tool.title}
          </Link>
        );
      })}
    </div>
  );
};

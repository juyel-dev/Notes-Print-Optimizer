'use client';

import React, { useMemo, useState } from 'react';
import { Search, SearchX, X } from 'lucide-react';
import { ToolCard } from './ToolCard';
import {
  TOOL_REGISTRY,
  isNewTool,
  toolHref,
  type ToolCategory,
  type ToolDefinition,
} from '@/lib/tools/registry';
import { searchTools } from '@/lib/tools/search';

/**
 * Landing tool discovery: one search field, then tools grouped by job.
 * The groups ARE the filter — a separate category chip row would only repeat
 * them — so scanning is "find the section, pick the card".
 *
 * Cards are real <Link>s to /tools/<slug>/ — the URL remains the source of
 * truth for the active tool (deep-linkable + crawlable).
 */
interface ToolSection {
  id: string;
  label: string;
  blurb: string;
  categories: ToolCategory[];
}

const SECTIONS: ToolSection[] = [
  {
    id: 'pdf',
    label: 'PDF',
    blurb: 'Get notes ready for the printer, then merge, split and arrange them.',
    categories: ['pdf'],
  },
  {
    id: 'image',
    label: 'Images',
    blurb: 'Turn pages into pictures, or pictures into a PDF.',
    categories: ['image'],
  },
  {
    id: 'security',
    label: 'Security',
    blurb: 'Lock a file, or make a password worth locking it with.',
    categories: ['security'],
  },
  {
    id: 'text',
    label: 'Text & utility',
    blurb: 'Small tools for everyday study work.',
    categories: ['utility', 'text'],
  },
];

export const ToolsBox: React.FC = () => {
  const [query, setQuery] = useState('');

  const visibleTools = useMemo(() => searchTools(TOOL_REGISTRY, query), [query]);

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        tools: visibleTools.filter((tool: ToolDefinition) =>
          section.categories.includes(tool.category),
        ),
      })).filter((section) => section.tools.length > 0),
    [visibleTools],
  );

  return (
    <section
      id="tools"
      aria-label="All tools"
      className="flex scroll-mt-20 flex-col gap-10"
    >
      <div className="flex flex-col gap-5 border-t border-surface-2 pt-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h2
            className="text-[1.75rem] font-bold tracking-[-0.02em] text-ink sm:text-3xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            All tools
          </h2>
          <p className="text-sm text-ink-muted sm:text-[15px]">
            {visibleTools.length} {visibleTools.length === 1 ? 'tool' : 'tools'}. Pick one, drop a
            file, done. Nothing leaves your device.
          </p>
        </div>

        <div role="search" className="relative w-full sm:w-[420px]">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: dark notes, merge, image to PDF"
            aria-label="Search tools"
            className="h-12 w-full rounded-xl border border-elevated bg-surface pl-[42px] pr-10 text-[15px] font-medium text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] focus:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {sections.length > 0 ? (
        sections.map((section) => (
          <div
            key={section.id}
            className="grid gap-5 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-8"
          >
            <div className="flex flex-col gap-2 lg:pt-1">
              <h3 className="font-mono text-[13px] font-medium uppercase tracking-[0.1em] text-accent">
                {section.label}
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">{section.blurb}</p>
            </div>

            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.tools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  title={tool.title}
                  description={tool.description}
                  icon={tool.icon}
                  chips={tool.chips}
                  href={toolHref(tool.id)}
                  isNew={isNewTool(tool)}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-elevated bg-surface/50 px-4 py-10 text-center">
          <SearchX className="h-6 w-6 text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-bold text-ink">No tool found</p>
          <p className="text-xs text-ink-muted">
            Nothing matches &ldquo;{query.trim()}&rdquo; — try &ldquo;image&rdquo;, &ldquo;merge&rdquo; or &ldquo;password&rdquo;.
          </p>
        </div>
      )}
    </section>
  );
};

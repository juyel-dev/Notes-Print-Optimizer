'use client';

import React, { useMemo, useState } from 'react';
import { Search, SearchX, X } from 'lucide-react';
import { ToolCard } from './ToolCard';
import {
  TOOL_REGISTRY,
  getToolCategories,
  isNewTool,
  toolHref,
  type ToolCategory,
} from '@/lib/tools/registry';
import { searchTools } from '@/lib/tools/search';

/**
 * Tool discovery is the main landing-page surface: one search field,
 * lightweight category filters, then a consistent grid of task cards.
 *
 * Cards are real <Link>s to /tools/<slug>/ — the URL remains the source of
 * truth for the active tool (deep-linkable + crawlable).
 */
export const ToolsBox: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | ToolCategory>('all');

  const categories = useMemo(() => getToolCategories(TOOL_REGISTRY), []);

  const visibleTools = useMemo(
    () =>
      searchTools(
        activeCategory === 'all'
          ? TOOL_REGISTRY
          : TOOL_REGISTRY.filter((tool) => tool.category === activeCategory),
        query,
      ),
    [activeCategory, query],
  );

  return (
    <section
      id="tools"
      aria-label="Choose a tool"
      className="flex scroll-mt-20 flex-col gap-4"
    >
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-ink sm:text-xl">
            Choose what you need
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted sm:text-sm">
            Search by task, filter by type, and open a tool in one click.
          </p>
        </div>
        <span className="text-xs font-semibold text-ink-faint">
          {visibleTools.length} {visibleTools.length === 1 ? 'tool' : 'tools'}
        </span>
      </div>

      <div role="search" className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools — dark notes, merge, image to PDF…"
          aria-label="Search tools"
          className="h-12 w-full rounded-xl border border-elevated bg-surface/90 pl-10 pr-10 text-sm text-ink shadow-sm placeholder:text-ink-faint transition-[border-color,box-shadow] focus:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {categories.length > 1 && (
        <div
          className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filter tools by category"
        >
          {(['all', ...categories] as const).map((cat) => {
            const active = activeCategory === cat;
            const labelMap: Record<string, string> = {
              all: 'All',
              pdf: 'PDF',
              image: 'Images',
              security: 'Security',
              utility: 'Utility',
              text: 'Text',
            };

            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveCategory(cat)}
                className={
                  active
                    ? 'h-8 shrink-0 rounded-full border border-primary-strong bg-primary-strong px-3.5 text-xs font-bold text-white shadow-sm transition-colors'
                    : 'h-8 shrink-0 rounded-full border border-elevated bg-surface px-3.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary/30 hover:text-ink'
                }
              >
                {labelMap[cat] ?? String(cat)}
              </button>
            );
          })}
        </div>
      )}

      {visibleTools.length > 0 ? (
        <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <ToolCard
                key={tool.id}
                title={tool.title}
                description={tool.description}
                icon={Icon}
                gradient={tool.gradient}
                chips={tool.chips}
                cta={tool.cta}
                href={toolHref(tool.id)}
                isNew={isNewTool(tool)}
              />
            );
          })}
        </div>
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

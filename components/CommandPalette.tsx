'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { TOOL_REGISTRY, toolHref } from '@/lib/tools/registry';
import { searchTools } from '@/lib/tools/search';

/**
 * Global command palette. Mounted once in PersistentShell so it's reachable
 * from any page (landing or mid-tool) via Cmd/Ctrl+K — the more tools ship
 * (Phase B: compress, rotate, watermark, …) the more this matters as a fast
 * path, not just a landing-page nicety.
 */
export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = searchTools(TOOL_REGISTRY, query).slice(0, 8);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    // A visible header button dispatches this so the palette is reachable
    // without knowing the shortcut, not just Cmd/Ctrl+K.
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('po:open-command-palette', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('po:open-command-palette', openHandler);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus after the dialog paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const launch = (index: number) => {
    const tool = results[index];
    if (!tool) return;
    setOpen(false);
    router.push(toolHref(tool.id));
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search tools"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-elevated bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-elevated px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); launch(activeIndex); }
            }}
            placeholder="Search tools…"
            aria-label="Search tools"
            aria-activedescendant={results[activeIndex] ? `cmdk-item-${results[activeIndex].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            autoComplete="off"
            className="h-8 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-elevated bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-faint sm:block">
            ESC
          </kbd>
        </div>

        <ul id="cmdk-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-ink-faint">No tool matches &ldquo;{query}&rdquo;</li>
          )}
          {results.map((tool, i) => {
            const Icon = tool.icon;
            const active = i === activeIndex;
            return (
              <li
                key={tool.id}
                id={`cmdk-item-${tool.id}`}
                role="option"
                aria-selected={active}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => launch(i)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    active ? 'bg-primary/15 text-ink' : 'text-ink-muted hover:bg-surface-2'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
                  <span className="flex-1 font-semibold">{tool.title}</span>
                  {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

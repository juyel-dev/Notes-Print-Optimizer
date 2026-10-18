'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileOutput, Loader2, RotateCcw, ScanSearch, Redo2, Undo2, X } from 'lucide-react';
import type { OrganizeWorkflow } from '@/lib/organize/useOrganizeWorkflow';
import { isUntouched } from '@/lib/organize/pageOps';
import { PageCard } from './PageCard';
import { OrganizeDock } from './OrganizeDock';
import { useDragReorder } from './useDragReorder';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';
const CHIP = `inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-elevated bg-surface px-4 text-xs font-bold text-ink-muted transition-colors hover:text-ink disabled:opacity-40 ${FOCUS}`;

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** The light table: every page as a sheet you can select, turn, move and delete. */
export const OrganizeStudioView: React.FC<{ workflow: OrganizeWorkflow }> = ({ workflow }) => {
  const { state, dispatch, getThumb, requestThumb } = workflow;
  void workflow.thumbVersion; // re-render as thumbnails arrive
  const busy = state.step === 'exporting';
  const items = state.items;
  const total = state.source!.pageCount;
  const selSet = useMemo(() => new Set(state.selected), [state.selected]);
  const changed = !isUntouched(items, total);
  const live = useRef(state);
  live.current = state;
  const lastClicked = useRef<string | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);

  useEffect(() => {
    if (state.blankScan === null && state.blankFound !== null) setBannerOpen(true);
  }, [state.blankScan, state.blankFound]);

  const dnd = useDragReorder({
    getSelection: () => live.current.selected,
    getOrder: () => live.current.items.map((p) => p.id),
    onDrop: (ids, beforeId) => dispatch({ type: 'MOVE_BEFORE', ids, beforeId }),
  });

  const onToggle = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (dnd.consumeClick()) return;
      if (e.shiftKey && lastClicked.current) dispatch({ type: 'SELECT_RANGE', fromId: lastClicked.current, toId: id });
      else dispatch({ type: 'SELECT_TOGGLE', id });
      lastClicked.current = id;
    },
    [dispatch, dnd],
  );
  const onRotateOne = useCallback((id: string) => dispatch({ type: 'ROTATE', delta: 90, ids: [id] }), [dispatch]);

  // Keyboard shortcuts (desktop): undo/redo, select all, turn, move, delete, clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || busy) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (mod && k === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if (mod && k === 'a') {
        e.preventDefault();
        dispatch({ type: 'SELECT_ALL' });
      } else if (!mod && !e.altKey) {
        if (k === 'r') dispatch({ type: 'ROTATE', delta: e.shiftKey ? -90 : 90 });
        else if (e.key === '[') dispatch({ type: 'NUDGE', dir: -1 });
        else if (e.key === ']') dispatch({ type: 'NUDGE', dir: 1 });
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (live.current.selected.length > 0) {
            e.preventDefault();
            dispatch({ type: 'DELETE' });
          }
        } else if (e.key === 'Escape') dispatch({ type: 'SELECT_NONE' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, busy]);

  const grabbed = dnd.drag ? items.find((p) => p.id === dnd.drag!.grabbed) : null;
  const grabbedThumb = grabbed && grabbed.src !== null ? getThumb(grabbed.src)?.url : null;
  const scanning = state.blankScan;
  const partial = state.selected.length > 0 && state.selected.length < items.length;

  return (
    <div className="flex flex-col gap-4 pb-36">
      {state.error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-deep/60 bg-danger-faint px-4 py-3 text-sm text-danger-soft">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      {/* ── Top bar: history + export ─────────────────────────── */}
      <div className="sticky top-[60px] z-30 -mx-4 flex items-center gap-2 border-b border-surface-2/70 bg-bg/90 px-4 py-2 backdrop-blur-md">
        <button type="button" onClick={() => dispatch({ type: 'UNDO' })} disabled={state.past.length === 0 || busy} aria-label="Undo" title="Undo (Ctrl+Z)" className={`flex h-11 w-11 items-center justify-center rounded-full border border-elevated bg-surface text-ink disabled:opacity-35 ${FOCUS}`}>
          <Undo2 className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => dispatch({ type: 'REDO' })} disabled={state.future.length === 0 || busy} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={`flex h-11 w-11 items-center justify-center rounded-full border border-elevated bg-surface text-ink disabled:opacity-35 ${FOCUS}`}>
          <Redo2 className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        {changed && (
          <button type="button" onClick={() => dispatch({ type: 'REVERT_ALL' })} disabled={busy} className={`hidden h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-ink-muted hover:text-ink sm:inline-flex ${FOCUS}`}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Revert all
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void workflow.handleExport(false)}
          disabled={items.length === 0 || busy}
          className={`inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-extrabold text-bg shadow-md transition-[transform,opacity] duration-150 active:scale-95 disabled:opacity-40 ${FOCUS}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileOutput className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Building…' : `Export ${items.length} page${items.length === 1 ? '' : 's'}`}
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="min-w-0 truncate text-sm font-bold text-ink">{state.source!.name}</p>
        <p className="shrink-0 font-mono text-xs tabular-nums text-ink-faint">
          {items.length === total && !changed ? `${total} pages` : `${items.length} of ${total} pages · edited`}
        </p>
      </div>

      {/* ── Select chips ──────────────────────────────────────── */}
      <div role="group" aria-label="Select pages" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" className={CHIP} onClick={() => dispatch({ type: 'SELECT_ALL' })} disabled={busy || items.length === 0}>All</button>
        <button type="button" className={CHIP} onClick={() => dispatch({ type: 'SELECT_NONE' })} disabled={busy || state.selected.length === 0}>None</button>
        <button type="button" className={CHIP} onClick={() => dispatch({ type: 'SELECT_PARITY', parity: 'odd' })} disabled={busy || items.length === 0}>Odd</button>
        <button type="button" className={CHIP} onClick={() => dispatch({ type: 'SELECT_PARITY', parity: 'even' })} disabled={busy || items.length === 0}>Even</button>
        <button type="button" className={CHIP} onClick={() => dispatch({ type: 'SELECT_INVERT' })} disabled={busy || items.length === 0}>Invert</button>
        <button type="button" className={`${CHIP} border-primary/40 text-primary-soft`} onClick={() => void workflow.handleFindBlanks()} disabled={busy || !!scanning || items.length === 0}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />}
          {scanning ? `Scanning ${scanning.done}/${scanning.total}` : 'Find blank pages'}
        </button>
        {partial && (
          <button type="button" className={CHIP} onClick={() => void workflow.handleExport(true)} disabled={busy}>
            <FileOutput className="h-3.5 w-3.5" aria-hidden="true" />
            Save only these ({state.selected.length})
          </button>
        )}
      </div>

      {bannerOpen && state.blankFound !== null && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-ink">
          <ScanSearch className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {state.blankFound === 0 ? (
              'No blank pages found.'
            ) : (
              <>
                Found <b>{state.blankFound}</b> nearly blank page{state.blankFound === 1 ? '' : 's'} and selected {state.blankFound === 1 ? 'it' : 'them'}.
              </>
            )}
          </span>
          {state.blankFound > 0 && (
            <button type="button" onClick={() => { dispatch({ type: 'DELETE' }); setBannerOpen(false); }} className={`h-11 shrink-0 rounded-full bg-primary-strong px-4 text-xs font-extrabold text-white ${FOCUS}`}>
              Delete {state.blankFound === 1 ? 'it' : 'them'}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setBannerOpen(false)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink ${FOCUS}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── The light table ───────────────────────────────────── */}
      <section
        aria-label="Pages"
        className="rounded-[28px] border border-surface-2 p-2 sm:p-4"
        style={{
          backgroundColor: 'var(--color-surface)',
          backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-ink) 16%, transparent) 1px, transparent 1.3px)',
          backgroundSize: '18px 18px',
        }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <p className="text-base font-bold text-ink">No pages left</p>
            <p className="max-w-xs text-sm text-ink-muted">Everything was deleted. Undo it, or revert to the original document.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => dispatch({ type: 'UNDO' })} className={CHIP}>Undo</button>
              <button type="button" onClick={() => dispatch({ type: 'REVERT_ALL' })} className={CHIP}>Revert all</button>
            </div>
          </div>
        ) : (
          <ul role="list" onPointerDown={dnd.onPointerDown} className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((p, i) => {
              const meta = p.src !== null ? state.metas[p.src] : undefined;
              return (
                <PageCard
                  key={p.id}
                  item={p}
                  position={i + 1}
                  thumb={p.src !== null ? (getThumb(p.src)?.url ?? null) : null}
                  aspect={meta ? meta.w / meta.h : 0.707}
                  selected={selSet.has(p.id)}
                  dropSide={dnd.target?.id === p.id ? dnd.target.side : null}
                  dragging={!!dnd.drag && dnd.drag.ids.includes(p.id)}
                  onToggle={onToggle}
                  onRotate={onRotateOne}
                  onVisible={requestThumb}
                />
              );
            })}
          </ul>
        )}
      </section>

      <p className="hidden px-1 text-xs leading-relaxed text-ink-faint lg:block">
        Drag pages to reorder · click to select (Shift for a range) · <kbd className="font-mono">R</kbd> turn · <kbd className="font-mono">[</kbd> <kbd className="font-mono">]</kbd> move · <kbd className="font-mono">Del</kbd> delete · <kbd className="font-mono">Ctrl+Z</kbd> undo
      </p>
      <p className="px-1 text-xs leading-relaxed text-ink-faint lg:hidden">Tap pages to select them, then use the buttons below to turn, move, copy or delete.</p>

      <OrganizeDock
        count={state.selected.length}
        total={items.length}
        disabled={busy}
        onRotate={(d) => dispatch({ type: 'ROTATE', delta: d })}
        onNudge={(dir) => dispatch({ type: 'NUDGE', dir })}
        onDuplicate={() => dispatch({ type: 'DUPLICATE' })}
        onBlank={() => dispatch({ type: 'INSERT_BLANK' })}
        onDelete={() => dispatch({ type: 'DELETE' })}
      />

      {dnd.drag && (
        <div aria-hidden="true" className="pointer-events-none fixed z-50" style={{ left: dnd.drag.x, top: dnd.drag.y, transform: 'translate(-50%, -60%) rotate(-5deg)' }}>
          <div className="relative">
            {grabbedThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={grabbedThumb} alt="" className="h-28 w-auto rounded-[3px] bg-white shadow-2xl" style={{ transform: `rotate(${grabbed?.rot ?? 0}deg)` }} />
            ) : (
              <div className="h-28 w-20 rounded-[3px] bg-white shadow-2xl" />
            )}
            {dnd.drag.ids.length > 1 && (
              <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-strong px-1.5 text-xs font-extrabold text-white">{dnd.drag.ids.length}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

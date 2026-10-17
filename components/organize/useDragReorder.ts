'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DropTarget {
  id: string;
  side: 'before' | 'after';
}

export interface DragState {
  /** Pages being dragged (the whole selection when the grabbed page is part of it). */
  ids: string[];
  grabbed: string;
  x: number;
  y: number;
}

interface Options {
  getSelection: () => string[];
  /** Page ids in their current on-screen order. */
  getOrder: () => string[];
  onDrop: (ids: string[], beforeId: string | null) => void;
}

const THRESHOLD = 6;

/**
 * Mouse / pen drag-to-reorder for the page grid (touch uses the Move buttons so
 * scrolling stays natural). Delegated from the grid: any `[data-page-id]` is a handle,
 * anything inside `[data-no-drag]` is not.
 */
export function useDragReorder({ getSelection, getOrder, onDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const start = useRef<{ x: number; y: number; id: string } | null>(null);
  const live = useRef<{ active: boolean; ids: string[]; target: DropTarget | null }>({ active: false, ids: [], target: null });
  const justDragged = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const cb = useRef({ getSelection, getOrder, onDrop });
  cb.current = { getSelection, getOrder, onDrop };

  const finish = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    start.current = null;
    live.current = { active: false, ids: [], target: null };
    setDrag(null);
    setTarget(null);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  useEffect(() => finish, [finish]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const el = e.target as Element;
      if (el.closest('[data-no-drag]')) return;
      const card = el.closest('[data-page-id]') as HTMLElement | null;
      if (!card) return;
      start.current = { x: e.clientX, y: e.clientY, id: card.dataset.pageId! };

      const move = (ev: PointerEvent) => {
        const s = start.current;
        if (!s) return;
        if (!live.current.active) {
          if (Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < THRESHOLD) return;
          const sel = cb.current.getSelection();
          const ids = sel.includes(s.id) ? cb.current.getOrder().filter((i) => sel.includes(i)) : [s.id];
          live.current = { active: true, ids, target: null };
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
        }
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-page-id]') as HTMLElement | null;
        let t: DropTarget | null = null;
        if (under && !live.current.ids.includes(under.dataset.pageId!)) {
          const r = under.getBoundingClientRect();
          t = { id: under.dataset.pageId!, side: ev.clientX < r.left + r.width / 2 ? 'before' : 'after' };
        }
        live.current.target = t;
        setTarget(t);
        setDrag({ ids: live.current.ids, grabbed: s.id, x: ev.clientX, y: ev.clientY });
        if (ev.clientY < 90) window.scrollBy(0, -16);
        else if (ev.clientY > window.innerHeight - 140) window.scrollBy(0, 16);
      };

      const up = () => {
        const { active, ids, target: t } = live.current;
        if (active) {
          justDragged.current = true;
          setTimeout(() => (justDragged.current = false), 0);
          if (t) {
            const order = cb.current.getOrder();
            let beforeId: string | null;
            if (t.side === 'before') beforeId = t.id;
            else {
              beforeId = null;
              for (let j = order.indexOf(t.id) + 1; j < order.length; j++) {
                if (!ids.includes(order[j])) {
                  beforeId = order[j];
                  break;
                }
              }
            }
            cb.current.onDrop(ids, beforeId);
          }
        }
        finish();
      };
      const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish();

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', finish);
      window.addEventListener('keydown', key);
      cleanup.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', finish);
        window.removeEventListener('keydown', key);
      };
    },
    [finish],
  );

  /** True once, right after a drag ends — lets the card ignore the click that follows the drop. */
  const consumeClick = useCallback(() => {
    const was = justDragged.current;
    justDragged.current = false;
    return was;
  }, []);

  return { drag, target, onPointerDown, consumeClick };
}

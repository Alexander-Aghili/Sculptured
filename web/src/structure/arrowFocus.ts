import './arrows.css';
import { useMemo, useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Selection } from '../draft/edits';

/** Past this many arrows a board draws them faint, and brings forward only the focused card's. */
export const QUIET_AFTER = 12;
const KEY = 'sculptured.board.arrows';

/** The ids whose arrows light up when `id` (an agent or a group) is focused. */
export function focusSet(d: TeamDraft, id: string | null): Set<string> {
  if (!id) return new Set();
  const out = new Set([id]);
  const agent = d.agents.find((a) => a.id === id);
  if (agent?.group_id) out.add(agent.group_id);
  for (const a of d.agents) if (a.group_id === id) out.add(a.id);
  return out;
}

/** Whether this browser asked for every arrow at full strength. */
export function allArrowsWanted(): boolean {
  try { return localStorage.getItem(KEY) === 'all'; } catch { return false; }
}

export function isQuiet(d: TeamDraft, allArrows: boolean): boolean {
  return !allArrows && d.connections.length > QUIET_AFTER;
}

/**
 * Focus and context for busy boards: arrows are faint until a card or group is hovered or
 * selected, then that card's arrows come forward with their labels. "All arrows" draws every
 * arrow at full strength; the choice is remembered in this browser.
 */
export function useArrowFocus(d: TeamDraft, selection: Selection | null) {
  const [allArrows, setAllArrows] = useState(allArrowsWanted);
  const [hover, setHover] = useState<string | null>(null);
  const focused = hover ?? (selection && selection.kind !== 'connection' ? selection.id : null);
  const lit = useMemo(() => focusSet(d, focused), [d, focused]);
  const toggleAll = () => setAllArrows((on) => {
    try { localStorage.setItem(KEY, on ? 'focus' : 'all'); } catch { /* a per-viewer convenience */ }
    return !on;
  });
  return {
    quiet: isQuiet(d, allArrows),
    allArrows,
    toggleAll,
    isLit: (from: string, to: string) => lit.has(from) || lit.has(to),
    hoverProps: (id: string) => ({ onPointerEnter: () => setHover(id), onPointerLeave: () => setHover((h) => (h === id ? null : h)) }),
  };
}

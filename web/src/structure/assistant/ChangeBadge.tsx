import type { Change, Marks } from './compare';

export const CHANGE_WORD: Record<Change, string> = { added: 'New', changed: 'Changed', removed: 'Removed' };

/** The proposal's word for a card (never colour alone). */
export function ChangeBadge({ marks, id }: { marks?: Marks; id: string }) {
  const c = marks?.[id];
  return c ? <span className={`change-badge change-${c}`}>{CHANGE_WORD[c]}</span> : null;
}

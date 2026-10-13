export type History<T> = { past: T[]; present: T; future: T[]; lastKey: string | null };

export const HISTORY_LIMIT = 100;

export function start<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null };
}

/** Records `next`. Consecutive pushes with the same key (typing, arrow moves) form one undo step. */
export function push<T>(h: History<T>, next: T, key?: string): History<T> {
  if (key !== undefined && key === h.lastKey) return { ...h, present: next, future: [] };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], lastKey: key ?? null };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null };
}

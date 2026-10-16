import type { EventRecord } from './generated/EventRecord';

/**
 * Longest string kept in the browser's live event list. A run's tool output, file contents and
 * handoff briefings make most of its bytes; the board needs only their start. The agent you open
 * loads its events in full (`useSeatEvents`), and stored history always has them whole.
 */
export const LIVE_TEXT_MAX = 2000;

const shortened = new WeakSet<EventRecord>();

/** True for a live copy whose long strings were cut. */
export const isShortened = (e: EventRecord) => shortened.has(e);

/** `e` with every string over LIVE_TEXT_MAX cut and marked "…"; agents' replies stay whole. */
export function shortenForFeed(e: EventRecord): EventRecord {
  if (e.body.type === 'agent-text') return e;
  let cut = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (v.length <= LIVE_TEXT_MAX) return v;
      cut = true;
      // A fresh copy: a plain slice keeps the whole original string alive behind it.
      return JSON.parse(JSON.stringify(`${v.slice(0, LIVE_TEXT_MAX)}…`)) as string;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const body = walk(e.body) as EventRecord['body'];
  if (!cut) return e;
  const out = { ...e, body };
  shortened.add(out);
  return out;
}

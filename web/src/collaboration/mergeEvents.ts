import type { EventRecord } from '../generated/EventRecord';

/** Stored history and the live feed, once per event (by sequence number), oldest first. */
export function mergeEvents(history: EventRecord[], feed: Record<string, EventRecord[]>): EventRecord[] {
  return [...new Map([...history, ...Object.values(feed).flat()].map((e) => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq);
}

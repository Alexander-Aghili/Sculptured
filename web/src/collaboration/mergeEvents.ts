import type { EventRecord } from '../generated/EventRecord';

/** Stored history and the live feed, once per event (by sequence number), oldest first. */
export function mergeEvents(history: EventRecord[], feed: Record<string, EventRecord[]>): EventRecord[] {
  return [...new Map([...history, ...Object.values(feed).flat()].map((e) => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq);
}

/** The event types the Run board's arrows and the Communications view read (not tool calls or replies). */
const COMMUNICATION = new Set(['message-queued', 'message-delivered', 'message-consumed', 'message-failed', 'handed-over', 'tenure-started', 'events-lost']);

/**
 * `mergeEvents` of only the communication events, oldest first. Returns `previous` while it holds
 * the same events, so a view recomputes its arrows only when a message or handoff arrives, not on
 * every tool call.
 */
export function communicationEvents(history: EventRecord[], feed: Record<string, EventRecord[]>, previous: EventRecord[] | null): EventRecord[] {
  const live: Record<string, EventRecord[]> = {};
  for (const [seat, list] of Object.entries(feed)) live[seat] = list.filter((e) => COMMUNICATION.has(e.body.type));
  const next = mergeEvents(history.filter((e) => COMMUNICATION.has(e.body.type)), live);
  const same = previous !== null && previous.length === next.length && next.every((e, i) => e.seq === previous[i].seq);
  return same ? previous : next;
}

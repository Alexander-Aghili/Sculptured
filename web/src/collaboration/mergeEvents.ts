import type { EventRecord } from '../generated/EventRecord';
import { isShortened } from '../liveText';

/**
 * Stored history and the live feed, once per event (by sequence number), oldest first. A live
 * copy wins unless its long text was cut and the full copy is here.
 */
export function mergeEvents(history: EventRecord[], feed: Record<string, EventRecord[]>): EventRecord[] {
  const bySeq = new Map<number, EventRecord>();
  for (const e of [...history, ...Object.values(feed).flat()]) if (!(isShortened(e) && bySeq.has(e.seq))) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** The event types the Run board's arrows and the Communications view read (not tool calls or replies). */
const COMMUNICATION = new Set(['message-queued', 'message-delivered', 'message-consumed', 'message-failed', 'message-held', 'handed-over', 'tenure-started', 'events-lost']);

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

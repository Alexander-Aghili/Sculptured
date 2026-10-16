import { errorText } from './errors';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { EventRecord } from './generated/EventRecord';
import { isShortened } from './liveText';

/**
 * Recent history for each of a team's agents (`tail` events each), merged with the live
 * feed and de-duplicated by seq, oldest first. Re-fetches on every snapshot (epoch).
 * Where history and feed hold the same seq, the feed's copy wins.
 *
 * `feed` must be reference-stable (for example `useRigStream`'s `state.feed`): a new object
 * on every render recomputes the merged list every render.
 */
export function useTeamEvents(seatIds: string[], feed: Record<string, EventRecord[]>, epoch: number, tail = 100) {
  const [history, setHistory] = useState<Record<string, EventRecord[]>>({});
  const [error, setError] = useState<string | null>(null);
  const key = seatIds.join('|');
  useEffect(() => {
    let live = true;
    const ids = key ? key.split('|') : [];
    Promise.all(ids.map((id) => api.latestSeatEvents(id, tail).then((events) => [id, events] as const)))
      .then((pairs) => {
        if (!live) return;
        setHistory(Object.fromEntries(pairs));
        setError(null);
      })
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [key, epoch, tail]);
  const events = useMemo(() => {
    const bySeq = new Map<number, EventRecord>();
    for (const list of Object.values(history)) for (const e of list) bySeq.set(e.seq, e);
    for (const list of Object.values(feed)) for (const e of list) if (!(isShortened(e) && bySeq.has(e.seq))) bySeq.set(e.seq, e);
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  }, [history, feed]);
  return { events, error };
}

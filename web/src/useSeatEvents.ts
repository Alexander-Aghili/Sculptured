import { errorText } from './errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, HISTORY_LIMIT } from './api';
import type { EventRecord } from './generated/EventRecord';
import { FEED_LIMIT } from './useRigStream';

export const GAP_NOTICE = 'Some events between history and live updates were not loaded.';

type Loaded = { seatId: string; events: EventRecord[] };

/**
 * The newest HISTORY_LIMIT events from the API plus live stream events newer than
 * them. Re-fetches on each snapshot (epoch). `truncated` means older events exist
 * that were not loaded. History belongs to one seat: switching seats shows loading,
 * never the previous seat's events. If the capped live feed starts after the end of
 * history, events in between may be missing; history is refetched once, and `gap`
 * stays true if the hole persists.
 */
export function useSeatEvents(seatId: string, feed: EventRecord[], epoch: number) {
  const [reloads, setReloads] = useState(0);
  // The history a gap was first seen with; one refetch per gap.
  const refetchedFrom = useRef<Loaded | null>(null);
  const { loaded, failed } = useHistory(seatId, epoch, reloads);

  const history = loaded?.seatId === seatId ? loaded.events : null;
  const error = failed?.seatId === seatId ? failed.message : null;
  const last = history && history.length > 0 ? history[history.length - 1].seq : 0;
  const gap = history !== null && last > 0 && feed.length >= FEED_LIMIT && feed[0].seq > last;

  useEffect(() => {
    if (!gap) refetchedFrom.current = null;
    else if (refetchedFrom.current === null && loaded) {
      refetchedFrom.current = loaded;
      setReloads((n) => n + 1);
    }
  }, [gap, loaded]);

  const events = useMemo(() => {
    const base = history ?? [];
    return [...base, ...feed.filter((e) => e.seq > last)];
  }, [history, feed, last]);

  return {
    events,
    loading: history === null && !error,
    error,
    truncated: (history?.length ?? 0) >= HISTORY_LIMIT,
    // Only a hole that survived the refetch is reported.
    gap: gap && refetchedFrom.current !== null && refetchedFrom.current !== loaded,
  };
}

/** The seat's latest history page, fetched again on each epoch and reload. */
function useHistory(seatId: string, epoch: number, reloads: number) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<{ seatId: string; message: string } | null>(null);
  useEffect(() => {
    let live = true;
    setFailed(null);
    api
      .latestSeatEvents(seatId)
      .then((h) => live && setLoaded({ seatId, events: h }))
      .catch((e: Error) => live && setFailed({ seatId, message: errorText(e) }));
    return () => {
      live = false;
    };
  }, [seatId, epoch, reloads]);
  return { loaded, failed };
}

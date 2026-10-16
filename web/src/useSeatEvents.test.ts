import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { api } from './api';
import type { EventRecord } from './generated/EventRecord';
import { LIVE_TEXT_MAX, shortenForFeed } from './liveText';
import { useSeatEvents } from './useSeatEvents';

vi.mock('./api', async (orig) => {
  const m = await orig<typeof import('./api')>();
  return { ...m, api: { ...m.api, latestSeatEvents: vi.fn(), seatEventsAfter: vi.fn() } };
});

it('loads the open agent\'s shortened live events in full', async () => {
  const ev = (seq: number, output: string) => ({ seq, at_ms: seq, provenance: 'captured-tool', actor: { kind: 'seat', id: 's' }, subject: { kind: 'seat', id: 's' }, body: { type: 'tool-resulted', turn_id: null, call_id: `c${seq}`, output, is_error: false } } as unknown as EventRecord);
  const full = ev(5, 'z'.repeat(LIVE_TEXT_MAX * 2));
  vi.mocked(api.latestSeatEvents).mockResolvedValue([ev(1, 'old')]);
  vi.mocked(api.seatEventsAfter).mockResolvedValue([full]);
  const feed = [shortenForFeed(full)];
  const { result } = renderHook(() => useSeatEvents('s', feed, 1));
  await waitFor(() => expect((result.current.events.at(-1)!.body as { output: string }).output.length).toBe(LIVE_TEXT_MAX * 2));
  expect(api.seatEventsAfter).toHaveBeenCalledWith('s', 4, expect.any(Number));
});

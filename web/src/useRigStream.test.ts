import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, FEED_LIMIT, reduce, useRigStream } from './useRigStream';
import { ev, FakeEventSource, openFake, seatView, snapshot } from './test-fixtures';

describe('reduce', () => {
  it('snapshot replaces seats and bumps epoch', () => {
    const s = reduce(emptyState, { kind: 'snapshot', snapshot: snapshot() });
    expect(Object.keys(s.seats)).toEqual(['dev.a@r', 'dev.b@r']);
    expect(s.epoch).toBe(1);
    expect(reduce(s, { kind: 'snapshot', snapshot: snapshot() }).epoch).toBe(2);
  });

  it('event replaces the seat view and appends to that seat feed', () => {
    const s0 = reduce(emptyState, { kind: 'snapshot', snapshot: snapshot() });
    const item = {
      event: ev(11, { type: 'turn-started', turn_id: 'turn-1' }),
      seat: seatView('a', { activity: 'working', current_turn: 'turn-1' }),
    };
    const s1 = reduce(s0, { kind: 'event', item });
    expect(s1.seats['dev.a@r'].activity).toBe('working');
    expect(s1.feed['dev.a@r'].map((e) => e.seq)).toEqual([11]);
    expect(s1.seats['dev.b@r']).toBe(s0.seats['dev.b@r']);
  });

  it('ignores duplicate or older seqs and bounds the feed', () => {
    let s = reduce(emptyState, { kind: 'snapshot', snapshot: snapshot() });
    for (let i = 1; i <= FEED_LIMIT + 100; i++) {
      s = reduce(s, { kind: 'event', item: { event: ev(i, { type: 'turn-started', turn_id: `t${i}` }), seat: null } });
    }
    s = reduce(s, { kind: 'event', item: { event: ev(5, { type: 'turn-started', turn_id: 'old' }), seat: null } });
    const feed = s.feed['dev.a@r'];
    expect(feed).toHaveLength(FEED_LIMIT);
    expect(feed[0].seq).toBe(101);
    expect(feed[feed.length - 1].seq).toBe(FEED_LIMIT + 100);
  });

  it('ignores the seat view of an event older than that seat feed', () => {
    const s0 = reduce(emptyState, { kind: 'snapshot', snapshot: snapshot() });
    const newer = {
      event: ev(12, { type: 'seat-lifecycle-changed', lifecycle: 'attention', reason: 'launch failed' }),
      seat: seatView('a', { lifecycle: 'attention', lifecycle_reason: 'launch failed' }),
    };
    const older = {
      event: ev(11, { type: 'seat-lifecycle-changed', lifecycle: 'launching', reason: null }),
      seat: seatView('a', { lifecycle: 'launching' }),
    };
    const s2 = reduce(reduce(s0, { kind: 'event', item: newer }), { kind: 'event', item: older });
    expect(s2.seats['dev.a@r'].lifecycle).toBe('attention');
    expect(s2.feed['dev.a@r'].map((e) => e.seq)).toEqual([12]);
  });
});

describe('useRigStream', () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('re-opens and re-snapshots on resync and on error', () => {
    const { result } = renderHook(() => useRigStream('r', openFake));
    const first = FakeEventSource.instances[0];
    expect(first.url).toBe('/api/stream?rig=r');

    act(() => first.emit('snapshot', snapshot()));
    expect(result.current.connected).toBe(true);
    expect(result.current.state.snapshot?.last_seq).toBe(10);

    act(() => first.emit('resync', 'lagged'));
    expect(first.closed).toBe(true);
    expect(result.current.connected).toBe(false);
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => FakeEventSource.instances[1].emit('snapshot', snapshot({ last_seq: 20 })));
    expect(result.current.state.snapshot?.last_seq).toBe(20);
    expect(result.current.state.epoch).toBe(2);

    act(() => FakeEventSource.instances[1].fail());
    expect(result.current.connected).toBe(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('counts lost events and re-snapshots when the server reports a gap', () => {
    const { result } = renderHook(() => useRigStream('r', openFake));
    const first = FakeEventSource.instances[0];
    act(() => first.emit('snapshot', snapshot()));
    const lost = { ...ev(11, { type: 'events-lost', count: 3 }), host: 'controld', subject: { kind: 'host', id: 'local' } };
    act(() => first.emit('event', { event: lost, seat: null }));
    expect(result.current.state.gaps).toBe(3);
    expect(first.closed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => FakeEventSource.instances[1].emit('snapshot', snapshot({ last_seq: 11 })));
    expect(result.current.state.epoch).toBe(2);
    expect(result.current.state.gaps).toBe(3);
  });

  it('clears state and connection when the rig changes', () => {
    const { result, rerender } = renderHook(({ rig }) => useRigStream(rig, openFake), { initialProps: { rig: 'r' } });
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    const lost = { ...ev(11, { type: 'events-lost', count: 2 }), host: 'controld', subject: { kind: 'host', id: 'local' } };
    act(() => FakeEventSource.instances[0].emit('event', { event: lost, seat: null }));
    expect(result.current.state.gaps).toBe(2);
    rerender({ rig: 'other' });
    expect(FakeEventSource.instances.at(-1)!.url).toBe('/api/stream?rig=other');
    expect(result.current.connected).toBe(false);
    expect(result.current.state.snapshot).toBeNull();
    expect(result.current.state.seats).toEqual({});
    expect(result.current.state.feed).toEqual({});
    expect(result.current.state.gaps).toBe(0);
    act(() => FakeEventSource.instances.at(-1)!.emit('snapshot', snapshot()));
    expect(result.current.connected).toBe(true);
    expect(result.current.state.snapshot).not.toBeNull();
  });

  it('doubles the error delay up to a cap and a snapshot resets it', () => {
    renderHook(() => useRigStream('r', openFake));
    const count = () => FakeEventSource.instances.length;
    const failAndExpectDelay = (ms: number) => {
      const before = count();
      act(() => FakeEventSource.instances[before - 1].fail());
      act(() => {
        vi.advanceTimersByTime(ms - 1);
      });
      expect(count()).toBe(before);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(count()).toBe(before + 1);
    };
    for (const ms of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) failAndExpectDelay(ms);
    act(() => FakeEventSource.instances[count() - 1].emit('snapshot', snapshot()));
    failAndExpectDelay(1000);
  });

  it('reopens on a malformed frame instead of throwing', () => {
    const { result } = renderHook(() => useRigStream('r', openFake));
    const first = FakeEventSource.instances[0];
    act(() => first.emit('snapshot', snapshot()));
    act(() => {
      for (const fn of first.listeners['event']) fn(new MessageEvent('event', { data: '{not json' }));
    });
    expect(first.closed).toBe(true);
    expect(result.current.connected).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useRigStream('r', openFake));
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});

describe('reduce: what the team is set to', () => {
  it('follows rig-desired-changed for its own team and ignores other teams', () => {
    const start = reduce(emptyState, { kind: 'snapshot', snapshot: snapshot() });
    const ev0 = ev(20, { type: 'rig-desired-changed', desired: 'stopped' });
    const own = reduce(start, { kind: 'event', item: { event: { ...ev0, subject: { kind: 'rig', id: 'r' } }, seat: null } });
    expect(own.snapshot!.desired).toBe('stopped');
    const other = reduce(start, { kind: 'event', item: { event: { ...ev0, subject: { kind: 'rig', id: 'q' } }, seat: null } });
    expect(other).toBe(start);
  });
});

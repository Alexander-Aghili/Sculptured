import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { compiledRig, ev, FakeEventSource, openFake, seatView, snapshot } from './test-fixtures';
import { RESYNC_MIN_MS } from './useRigStream';
import { ALL_TEAMS_STREAM, useTeams } from './useTeams';
import type { RigSnapshot } from './generated/RigSnapshot';

vi.mock('./api', async (orig) => {
  const m = await orig<typeof import('./api')>();
  return { ...m, api: { ...m.api, listRigs: vi.fn() } };
});

const summary = (name: string) => ({ name, desired: 'stopped' as const, seat_count: 2, running_count: 0, attention_count: 0 });
const NAMES = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];

/** A snapshot of team `name`: the fixture rig with its ids moved to that team. */
function snapOf(name: string, over: Partial<RigSnapshot> = {}): RigSnapshot {
  const base = snapshot();
  const rig = compiledRig();
  const id = (s: string) => s.replace('@r', `@${name}`);
  return {
    ...base,
    rig: { ...rig, name, seats: rig.seats.map((s) => ({ ...s, id: id(s.id) })), launch_layers: rig.launch_layers.map((l) => l.map(id)) },
    seats: base.seats.map((s) => ({ ...s, id: id(s.id), rig: name })),
    ...over,
  };
}

describe('useTeams', () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.mocked(api.listRigs).mockResolvedValue(NAMES.map(summary));
  });
  afterEach(() => vi.useRealTimers());

  it('follows seven teams over one connection', async () => {
    const { result } = renderHook(() => useTeams('t1', openFake));
    await waitFor(() => expect(result.current.names).toEqual(NAMES));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(ALL_TEAMS_STREAM);
    expect(ALL_TEAMS_STREAM).toBe('/api/stream?all=true');
  });

  it('routes each snapshot and tagged event to its own team', async () => {
    const { result } = renderHook(() => useTeams('t1', openFake));
    const src = FakeEventSource.instances[0];
    act(() => {
      src.emit('snapshot', snapOf('t1'));
      src.emit('snapshot', snapOf('t2'));
    });
    expect(result.current.teams.t1.connected).toBe(true);
    expect(result.current.teams.t2.state.snapshot?.rig.name).toBe('t2');
    expect(result.current.teams.t3?.state.snapshot ?? null).toBeNull();

    const item = { rig: 't2', event: { ...ev(20, { type: 'turn-started', turn_id: 'x' }), subject: { kind: 'seat', id: 'dev.a@t2' } }, seat: { ...seatView('a', { activity: 'working' }), id: 'dev.a@t2', rig: 't2' } };
    act(() => src.emit('event', item));
    expect(result.current.teams.t2.state.seats['dev.a@t2'].activity).toBe('working');
    expect(result.current.teams.t1.state.seats['dev.a@r']).toBeUndefined();
    expect(result.current.teams.t1.state.feed['dev.a@t2']).toBeUndefined();
  });

  it('marks teams without a snapshot connected once the stream is ready', async () => {
    const { result } = renderHook(() => useTeams('t1', openFake));
    await waitFor(() => expect(result.current.names).toEqual(NAMES));
    expect(result.current.teams.t3.connected).toBe(false);
    act(() => FakeEventSource.instances[0].emit('ready', 'ready'));
    expect(result.current.teams.t3.connected).toBe(true);
  });

  it('a team that starts later joins without a new connection', () => {
    vi.mocked(api.listRigs).mockResolvedValue([]);
    const { result } = renderHook(() => useTeams(undefined, openFake));
    act(() => FakeEventSource.instances[0].emit('snapshot', snapOf('fresh')));
    expect(result.current.names).toContain('fresh');
    expect(result.current.teams.fresh.state.snapshot?.rig.name).toBe('fresh');
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('on resync it reopens the one connection and every team takes a fresh snapshot', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTeams('t1', openFake));
    const first = FakeEventSource.instances[0];
    act(() => {
      first.emit('snapshot', snapOf('t1'));
      first.emit('snapshot', snapOf('t2'));
    });
    act(() => first.emit('resync', 'lagged'));
    expect(first.closed).toBe(true);
    expect(result.current.teams.t1.connected).toBe(false);
    expect(result.current.teams.t2.connected).toBe(false);
    act(() => vi.advanceTimersByTime(RESYNC_MIN_MS));
    expect(FakeEventSource.instances).toHaveLength(2);
    const second = FakeEventSource.instances[1];
    expect(second.url).toBe(ALL_TEAMS_STREAM);
    act(() => second.emit('snapshot', snapOf('t2', { last_seq: 40 })));
    expect(result.current.teams.t2.connected).toBe(true);
    expect(result.current.teams.t2.state.snapshot?.last_seq).toBe(40);
    expect(result.current.teams.t2.state.epoch).toBe(2);
    expect(result.current.teams.t1.connected).toBe(false);
  });

  it('a lost-events notice from a host counts for every team and reopens', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTeams('t1', openFake));
    const src = FakeEventSource.instances[0];
    act(() => {
      src.emit('snapshot', snapOf('t1'));
      src.emit('snapshot', snapOf('t2'));
    });
    const lost = { ...ev(11, { type: 'events-lost', count: 3 }), host: 'controld', subject: { kind: 'host', id: 'local' } };
    act(() => src.emit('event', { rig: null, event: lost, seat: null }));
    expect(result.current.teams.t1.state.gaps).toBe(3);
    expect(result.current.teams.t2.state.gaps).toBe(3);
    act(() => vi.advanceTimersByTime(RESYNC_MIN_MS));
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('closes its connection on unmount', () => {
    const { unmount } = renderHook(() => useTeams('t1', openFake));
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { RESYNC_MIN_MS } from '../useRigStream';
import { AppRoutes } from '../App';
import { ev, FakeEventSource, openFake, seatView, snapshot } from '../test-fixtures';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return { ...m, api: { ...m.api, latestSeatEvents: vi.fn(), listRigs: vi.fn().mockResolvedValue([]) } };
});

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes openStream={openFake} />
    </MemoryRouter>,
  );
}

describe('Agent pane', () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.mocked(api.latestSeatEvents).mockResolvedValue([
      ev(1, { type: 'message-queued', message_id: 'm1', intent: 'inform', text: 'hello' }),
      ev(2, { type: 'message-consumed', message_id: 'm1', turn_id: 't1' }),
      ev(3, { type: 'agent-text', turn_id: 't1', text: 'stub received: hello' }),
      ev(4, { type: 'unrecognized', raw: { type: 'mystery' } }),
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it('renders history, then appends live events from the stream', async () => {
    renderAt('/rig/r/agent/dev.a%40r');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    const convo = await screen.findByRole('list', { name: 'Conversation' });
    expect(await screen.findByText('stub received: hello')).toBeInTheDocument();
    // Delivery states read queued → delivered → read.
    expect(convo).toHaveTextContent('read');
    expect(convo).toHaveTextContent(/unrecognized event/i);
    act(() =>
      FakeEventSource.instances[0].emit('event', {
        event: ev(5, { type: 'agent-text', turn_id: 't2', text: 'live line' }),
        seat: seatView('a'),
      }),
    );
    expect(await screen.findByText('live line')).toBeInTheDocument();
  });

  it('opens Visual progress as its own tab, jumps to a transcript item and comes back with Esc', async () => {
    renderAt('/rig/r/agent/dev.a%40r/visual');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    expect(screen.getByRole('link', { name: 'Visual progress' })).toHaveAttribute('aria-current', 'page');
    const process = await screen.findByRole('region', { name: 'Process' });
    const user = userEvent.setup();
    await user.click(await within(process).findByRole('button', { name: /stub received: hello/ }));
    // The Transcript tab opens at that reply, highlighted, with a way back.
    expect(screen.getByRole('link', { name: 'Transcript' })).toHaveAttribute('aria-current', 'page');
    await vi.waitFor(() => expect(document.querySelector('[data-item-key="a-3"]')).toHaveClass('flash'));
    expect(screen.getByRole('button', { name: /Visual progress/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('region', { name: 'Process' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visual progress' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the selected seat across a stream resync', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt('/rig/r/agent/dev.a%40r/events');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    expect(screen.getByRole('region', { name: 'Agent a' })).toBeInTheDocument();
    act(() => FakeEventSource.instances[0].emit('resync', 'lagged'));
    act(() => {
      vi.advanceTimersByTime(RESYNC_MIN_MS);
    });
    act(() => FakeEventSource.instances[1].emit('snapshot', snapshot({ last_seq: 30 })));
    expect(screen.getByRole('region', { name: 'Agent a' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
    expect(vi.mocked(api.latestSeatEvents).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('events tab shows raw rows with provenance', async () => {
    renderAt('/rig/r/agent/dev.a%40r/events');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    const table = await screen.findByRole('table', { name: 'Raw events' });
    // The table renders before history arrives; wait for a history row.
    expect(await screen.findByText('agent-text')).toBeInTheDocument();
    expect(table).toHaveTextContent('agent-text');
    expect(table).toHaveTextContent('protocol-observed');
    expect(table).toHaveTextContent('system:hostd');
  });

  it('shows the full lifecycle reason and unknown tokens', async () => {
    const reason = 'exited unexpectedly: ' + 'boom '.repeat(70).trim();
    expect(reason.length).toBeGreaterThanOrEqual(300);
    renderAt('/rig/r/agent/dev.a%40r');
    act(() =>
      FakeEventSource.instances[0].emit(
        'snapshot',
        snapshot({ seats: [seatView('a', { lifecycle: 'attention', lifecycle_reason: reason }), seatView('b')] }),
      ),
    );
    const header = screen.getByRole('region', { name: 'Agent a' });
    expect(header).toHaveTextContent(`Reason: ${reason}`);
    const el = within(header).getByText(reason).parentElement!;
    expect(el).not.toHaveClass('clamp');
    expect(header).toHaveTextContent('tokens unknown');
    expect(await screen.findByText('stub received: hello')).toBeInTheDocument();
  });

  it('says when history is truncated', async () => {
    vi.mocked(api.latestSeatEvents).mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => ev(i + 1, { type: 'agent-text', turn_id: 't', text: `l${i}` })),
    );
    renderAt('/rig/r/agent/dev.a%40r');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    expect(await screen.findByText('Older events not loaded.')).toBeInTheDocument();
  });

  it('does not carry controls or history from one seat to the next', async () => {
    let finishB!: (v: ReturnType<typeof ev>[]) => void;
    renderAt('/rig/r/agent/dev.a%40r');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot({ seats: [seatView('a', { current_turn: 't1' }), seatView('b')] })));
    await screen.findByText('stub received: hello');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Message'), 'draft for a');
    await user.click(screen.getByRole('button', { name: 'Details & controls' }));
    await user.click(screen.getByRole('button', { name: 'Hard stop…' }));
    expect(screen.getByRole('group', { name: 'Confirm stop agent' })).toHaveTextContent('Stops a.');
    vi.mocked(api.latestSeatEvents).mockImplementation(() => new Promise((r) => (finishB = r)));
    // Select agent b from the sidebar (the pane replaces the board).
    await user.click(screen.getByRole('link', { name: /^b — / }));
    expect(screen.getByRole('region', { name: 'Agent b' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Confirm stop agent' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(screen.queryByText('stub received: hello')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading history');
    act(() => finishB([]));
    expect(await screen.findByText('No conversation yet.')).toBeInTheDocument();
  });

  it('shows each event once where history and the live feed overlap, in both tabs', async () => {
    vi.mocked(api.latestSeatEvents).mockResolvedValue(
      [1, 2, 3, 4].map((n) => ev(n, { type: 'agent-text', turn_id: 't', text: `line-${n}` })),
    );
    renderAt('/rig/r/agent/dev.a%40r/events');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    for (const n of [3, 4, 5])
      act(() =>
        FakeEventSource.instances[0].emit('event', {
          event: ev(n, { type: 'agent-text', turn_id: 't', text: `line-${n}` }),
          seat: seatView('a'),
        }),
      );
    const table = await screen.findByRole('table', { name: 'Raw events' });
    await vi.waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(6));
    const seqs = within(table).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent);
    expect(seqs).toEqual(['1', '2', '3', '4', '5']);
  });

  it('shows each overlapping event once in the conversation', async () => {
    vi.mocked(api.latestSeatEvents).mockResolvedValue(
      [1, 2, 3, 4].map((n) => ev(n, { type: 'agent-text', turn_id: 't', text: `line-${n}` })),
    );
    renderAt('/rig/r/agent/dev.a%40r');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    for (const n of [3, 4, 5])
      act(() =>
        FakeEventSource.instances[0].emit('event', {
          event: ev(n, { type: 'agent-text', turn_id: 't', text: `line-${n}` }),
          seat: seatView('a'),
        }),
      );
    await screen.findByText('line-5');
    for (const n of [1, 2, 3, 4, 5]) expect(screen.getAllByText(`line-${n}`)).toHaveLength(1);
  });

  it('refetches history when the capped live feed starts after history ends, and says so if a hole remains', async () => {
    const mk = (a: number, b: number) =>
      Array.from({ length: b - a + 1 }, (_, i) => ev(a + i, { type: 'agent-text', turn_id: 't', text: `l${a + i}` }));
    vi.mocked(api.latestSeatEvents).mockResolvedValue(mk(1, 4));
    renderAt('/rig/r/agent/dev.a%40r');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot()));
    await screen.findByText('l4');
    const before = vi.mocked(api.latestSeatEvents).mock.calls.length;
    // 500 live events from seq 100: events 5..99 are in neither history nor feed.
    act(() => {
      for (let n = 100; n < 600; n++)
        FakeEventSource.instances[0].emit('event', { event: ev(n, { type: 'agent-text', turn_id: 't', text: `l${n}` }), seat: seatView('a') });
    });
    expect(await screen.findByText('Some events between history and live updates were not loaded.')).toBeInTheDocument();
    expect(vi.mocked(api.latestSeatEvents).mock.calls.length).toBe(before + 1);
  });

  function header(seat: ReturnType<typeof seatView>) {
    renderAt('/rig/r/agent/dev.a%40r');
    act(() => FakeEventSource.instances[0].emit('snapshot', snapshot({ seats: [seat, seatView('b')] })));
    return screen.getByRole('region', { name: 'Agent a' }).querySelector('header')!;
  }

  it('discloses agent details without navigating away from the transcript', async () => {
    const h = header(seatView('a'));
    const toggle = within(h).getByRole('button', { name: 'Details & controls' });
    const details = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(details).toHaveAttribute('data-open', 'false');
    expect(details).not.toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveAttribute('data-open', 'true');
    expect(details).toBeVisible();
    expect(details).toHaveTextContent('idle · no turn in progress');
    expect(within(h).getByRole('link', { name: 'Transcript' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(toggle);
    expect(details).toHaveAttribute('data-open', 'false');
  });

  // M1: the provenance shown is that of the latest lifecycle change, not a constant.
  it('shows the provenance of the latest lifecycle change', () => {
    const h = header(seatView('a', { lifecycle: 'attention', lifecycle_reason: 'did not become ready within 60s', lifecycle_provenance: 'heuristic' }));
    expect(h).toHaveTextContent('status ≈ heuristic');
    expect(h).not.toHaveTextContent('protocol-observed');
  });

  it('shows the provenance as its tier mark and word, with the raw tier name as a tooltip', () => {
    const h = header(seatView('a'));
    expect(h).toHaveTextContent('status ◆ observed');
    expect(h).not.toHaveTextContent('protocol-observed');
    expect(h.querySelector('[title*="protocol-observed"]')).not.toBeNull();
  });

  it('says the lifecycle provenance is unknown before any lifecycle change', () => {
    const h = header(seatView('a', { lifecycle: 'planned', lifecycle_provenance: null }));
    expect(h).toHaveTextContent('status ∅ unknown');
  });

  // I5: turn, tool and activity only while running; last known while stale; else not running.
  it('shows turn and tool while running', () => {
    const working = { activity: 'working' as const, current_turn: 't1', current_tool: 'Bash' };
    const running = header(seatView('a', working));
    expect(running).toHaveTextContent('⣟working');
    expect(running).toHaveTextContent('working · turn in progress · tool bash');
  });

  it('says the state once in plain words, without empty turn and tool fields', () => {
    const h = header(seatView('a'));
    expect(h).toHaveTextContent('idle · no turn in progress');
    expect(h).not.toHaveTextContent('tool: none');
    expect(h).not.toHaveTextContent('running · idle');
  });

  it('labels a stale seat\'s turn and tool as last known', () => {
    const h = header(seatView('a', { activity: 'working', current_turn: 't1', current_tool: 'Bash', lifecycle: 'stale' }));
    expect(h).toHaveTextContent('∅unknown');
    expect(h).toHaveTextContent('last known: working · turn in progress · tool bash');
  });

  it('does not show an attention seat\'s old turn, tool or activity as current', () => {
    const h = header(seatView('a', { activity: 'working', current_turn: 't1', current_tool: 'Bash', lifecycle: 'attention' }));
    expect(h).toHaveTextContent('◉needs you');
    expect(h).toHaveTextContent('needs attention · not running');
    expect(h).not.toHaveTextContent('turn in progress');
    expect(h).not.toHaveTextContent(/bash/i);
    expect(h).not.toHaveTextContent('working');
  });
});

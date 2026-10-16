import type { EventRecord } from '../generated/EventRecord';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { api } from '../api';
import { resetSeenCache } from '../seen';
import { compiledRig, ev, FakeEventSource, openFake, seatView, snapshot } from '../test-fixtures';
import { openRigWords } from '../test-vocab';
import type { CompiledRig } from '../generated/CompiledRig';
import type { RigSnapshot } from '../generated/RigSnapshot';
import type { SeatView } from '../generated/SeatView';
import { forgetViewports } from './LiveGraph';
import { TOAST_MS } from './Toasts';
import { PROJECT_KEY, LEFT_PANEL_KEY, RIGHT_PANEL_KEY } from './Shell';
import { ALL_TEAMS_STREAM } from '../useTeams';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return {
    ...m,
    api: { ...m.api, latestSeatEvents: vi.fn(), teamRecent: vi.fn(), listRigs: vi.fn(), interrupt: vi.fn(), send: vi.fn(), stopRig: vi.fn() },
  };
});

function Where() {
  return <div data-testid="where">{decodeURIComponent(useLocation().pathname)}</div>;
}
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes openStream={openFake} />
      <Where />
    </MemoryRouter>,
  );
}
const where = () => screen.getByTestId('where').textContent;

/** Team `q`: group ops with agents x and y, each in its own folder. */
function rigQ(): CompiledRig {
  const base = compiledRig();
  const seat = (m: string) => ({ ...base.seats[0], id: `ops.${m}@q`, pod: 'ops', member: m, cwd: `/work/${m}-folder` });
  return { ...base, name: 'q', pods: [{ id: 'ops', label: 'Ops' }], seats: [seat('x'), seat('y')], edges: [], launch_layers: [[`ops.x@q`, `ops.y@q`]] };
}
function viewQ(m: string, over: Partial<SeatView> = {}): SeatView {
  return { ...seatView(m), id: `ops.${m}@q`, rig: 'q', pod: 'ops', ...over };
}
function snapQ(over: Partial<RigSnapshot> = {}): RigSnapshot {
  return { rig: rigQ(), desired: 'running', seats: [viewQ('x'), viewQ('y')], last_seq: 5, ...over };
}
const summary = (name: string, attention = 0) => ({ name, desired: 'running' as const, seat_count: 2, running_count: 2, attention_count: attention });

/** The one live connection every team shares (the latest one open). Snapshots name their team. */
function stream(_team: string) {
  const s = FakeEventSource.instances.filter((i) => i.url === ALL_TEAMS_STREAM && !i.closed).at(-1);
  if (!s) throw new Error('no live stream');
  return s;
}

async function twoTeams(url = '/rig/r', r: RigSnapshot = snapshot(), q: RigSnapshot = snapQ()) {
  vi.mocked(api.listRigs).mockResolvedValue([summary('r'), summary('q')]);
  renderAt(url);
  await waitFor(() => expect(api.listRigs).toHaveBeenCalled());
  await act(async () => {});
  expect(FakeEventSource.instances).toHaveLength(1);
  act(() => stream('r').emit('snapshot', r));
  act(() => stream('q').emit('snapshot', q));
}

beforeEach(() => {
  FakeEventSource.reset();
  forgetViewports();
  localStorage.clear();
  // Sidebar scenarios opt in to open panels; default layout is covered separately below.
  localStorage.setItem(LEFT_PANEL_KEY, 'true');
  localStorage.setItem(RIGHT_PANEL_KEY, 'true');
  resetSeenCache();
  vi.mocked(api.latestSeatEvents).mockReset().mockResolvedValue([]);
  vi.mocked(api.teamRecent).mockReset().mockResolvedValue({});
  vi.mocked(api.listRigs).mockReset().mockResolvedValue([]);
  vi.mocked(api.interrupt).mockReset().mockResolvedValue({});
  vi.mocked(api.send).mockReset().mockResolvedValue({ message_id: 'm1' });
  // These tests exercise the Run graph; Run opens on List unless the graph was chosen.
  localStorage.setItem('sculptured.run.view.v1', JSON.stringify('graph'));
});
afterEach(() => vi.useRealTimers());

describe('agent sidebar', () => {
  it('groups agents under team headers, blocked first, most active team first', async () => {
    const q = snapQ({ seats: [viewQ('x'), viewQ('y', { lifecycle: 'attention', lifecycle_reason: 'stuck' })] });
    await twoTeams('/rig/r', snapshot({ seats: [seatView('a', { activity: 'working', current_tool: 'Bash' }), seatView('b')] }), q);
    const side = screen.getByRole('navigation', { name: 'Agents' });
    const teams = within(side).getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    // q has an agent that needs you, so it is listed first even though r is open.
    expect(teams).toEqual(['team q', 'team r']);
    // q is another project: one row with its roll-up. r, the open one, lists its agents.
    const qRows = within(within(side).getByRole('region', { name: 'team q' })).getAllByRole('link');
    expect(qRows.map((l) => l.getAttribute('aria-label'))).toEqual(['Switch to q — 1 needs you']);
    const rRows = within(within(side).getByRole('region', { name: 'team r' })).getAllByRole('link', { name: / — / });
    expect(rRows.map((l) => l.getAttribute('aria-label'))).toEqual(['a — working', 'b — idle']);
  });

  it('shows state glyph, vendor mark, name, a short summary and age on one row', async () => {
    const now = Date.now();
    await twoTeams('/rig/r', snapshot({ seats: [seatView('a', { activity: 'working', current_tool: 'Bash', last_event_ms: now - 4 * 60_000 }), seatView('b', { last_event_ms: null })] }));
    const a = screen.getByRole('link', { name: 'a — working' });
    // The vendor mark is a drawn avatar (Practice), not text.
    expect(a.textContent).toBe('⣟abash4m');
    expect(a.querySelector('.glyph')).toHaveClass('spin');
    expect(a.querySelector('.avatar.v-practice svg')).not.toBeNull();
    const b = screen.getByRole('link', { name: 'b — idle' });
    expect(b.textContent).toBe('○bidleunknown');
    expect(b.querySelector('.avatar.v-practice svg')).not.toBeNull();
    // The team header rolls up the counts with words for assistive tech.
    expect(within(screen.getByRole('region', { name: 'team r' })).getByTitle('1 working')).toBeInTheDocument();
  });

  it('dims an idle agent after two hours', async () => {
    const now = Date.now();
    await twoTeams('/rig/r', snapshot({ seats: [seatView('a', { last_event_ms: now - 3 * 3_600_000 }), seatView('b', { last_event_ms: now })] }));
    expect(screen.getByRole('link', { name: 'a — idle' })).toHaveClass('dim');
    expect(screen.getByRole('link', { name: 'a — idle' })).toHaveTextContent('3h');
    expect(screen.getByRole('link', { name: 'b — idle' })).not.toHaveClass('dim');
  });

  it('j and k move the selection within the open project and Enter opens the agent', async () => {
    await twoTeams('/rig/q');
    const user = userEvent.setup();
    const sel = () => screen.getAllByRole('link', { name: / — / }).find((l) => l.classList.contains('selected'));
    await user.keyboard('j');
    expect(sel()).toHaveAccessibleName('x — idle');
    // The other project's agents are not listed, so j stops at the last agent of this one.
    await user.keyboard('jj');
    expect(sel()).toHaveAccessibleName('y — idle');
    await user.keyboard('k');
    expect(sel()).toHaveAccessibleName('x — idle');
    await user.keyboard('j{Enter}');
    expect(where()).toBe('/rig/q/agent/ops.y@q');
    expect(screen.getByRole('region', { name: 'Agent y' })).toBeInTheDocument();
  });

  it('clicking a row opens the agent pane', async () => {
    await twoTeams();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /^Switch to q/ }));
    await user.click(screen.getByRole('link', { name: 'x — idle' }));
    expect(where()).toBe('/rig/q/agent/ops.x@q');
  });
});

describe('projects in the sidebar', () => {
  const side = () => screen.getByRole('navigation', { name: 'Agents' });
  const region = (team: string) => within(side()).getByRole('region', { name: `team ${team}` });
  const agentLinks = (team: string) => within(region(team)).queryAllByRole('link', { name: /^[a-z] — / }).map((l) => l.getAttribute('aria-label'));

  it('lists only the open project’s agents; every other project is one row that switches to it', async () => {
    await twoTeams('/rig/r');
    expect(within(side()).getByText('Projects')).toBeInTheDocument();
    expect(agentLinks('r')).toEqual(['a — idle', 'b — idle']);
    expect(agentLinks('q')).toEqual([]);
    const user = userEvent.setup();
    await user.click(within(region('q')).getByRole('link', { name: 'Switch to q — 2 agents' }));
    expect(where()).toBe('/rig/q');
    expect(agentLinks('q')).toEqual(['x — idle', 'y — idle']);
    expect(agentLinks('r')).toEqual([]);
    expect(within(region('r')).getByRole('link', { name: 'Switch to r — 2 agents' })).toHaveAttribute('href', '/rig/r');
    // Remembered in this browser.
    expect(JSON.parse(localStorage.getItem(PROJECT_KEY)!)).toBe('q');
  });

  it('with no team on screen, opens the project last open in this browser, else the most active one', async () => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify('r'));
    await twoTeams('/?all');
    expect(agentLinks('r')).toEqual(['a — idle', 'b — idle']);
    expect(agentLinks('q')).toEqual([]);
  });

  it('falls back to the most active project when the remembered one is gone, and survives storage errors', async () => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify('deleted-team'));
    const get = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const q = snapQ({ seats: [viewQ('x'), viewQ('y', { lifecycle: 'attention', lifecycle_reason: 'stuck' })] });
    await twoTeams('/?all', snapshot(), q);
    expect(agentLinks('q')).toEqual(['y — needs you', 'x — idle']);
    await userEvent.setup().click(within(region('r')).getByRole('link', { name: /^Switch to r/ }));
    expect(where()).toBe('/rig/r');
    expect(agentLinks('r')).toEqual(['a — idle', 'b — idle']);
    get.mockRestore();
  });

  it('rolls each project up: needs you, working and done counts, or its size when quiet', async () => {
    const q = snapQ({ seats: [viewQ('x', { activity: 'working', current_tool: 'Bash' }), viewQ('y', { lifecycle: 'attention', lifecycle_reason: 'stuck' })] });
    const r = snapshot({ seats: [seatView('a', { activity: 'working', current_turn: 't11' }), seatView('b', { activity: 'working', current_tool: 'Edit' })] });
    await twoTeams('/rig/q', r, q);
    act(() => stream('r').emit('event', { event: ev(11, { type: 'turn-ended', turn_id: 't11', status: 'completed' }), seat: seatView('a') }));
    const row = within(region('r')).getByRole('link', { name: /^Switch to r/ });
    expect(row).toHaveAccessibleName('Switch to r — 1 working, 1 done (turn finished)');
    expect(row).toHaveTextContent(/⣟1.*✓1/);
    // The open project rolls up in its header too.
    expect(within(region('q')).getByTitle('1 needs you, 1 working')).toBeInTheDocument();
    // Nothing working any more: "done" stays until you look at that agent.
    act(() => stream('r').emit('snapshot', snapshot()));
    expect(within(region('r')).getByRole('link', { name: /^Switch to r/ })).toHaveAccessibleName('Switch to r — 1 done (turn finished)');
  });

  it('a project that needs you stays prominent while collapsed, and is listed first', async () => {
    await twoTeams('/rig/r');
    expect(region('q')).not.toHaveClass('needs-you');
    act(() => stream('q').emit('snapshot', snapQ({ seats: [viewQ('x'), viewQ('y', { lifecycle: 'attention', lifecycle_reason: 'asks a question' })] })));
    const teams = within(side()).getAllByRole('region').map((x) => x.getAttribute('aria-label'));
    expect(teams).toEqual(['team q', 'team r']);
    expect(region('q')).toHaveClass('needs-you');
    const row = within(region('q')).getByRole('link', { name: 'Switch to q — 1 needs you' });
    expect(row).toHaveClass('tone-row-red');
    // Glyph and word: ◉ 1, with "needs you" for assistive tech.
    expect(row.querySelector('.roll.st-needs-you')).toHaveTextContent('◉1 needs you');
    expect(agentLinks('q')).toEqual([]);
    // A stuck agent also waits on you: counted, and the project stays prominent.
    act(() => stream('q').emit('snapshot', snapQ({ seats: [viewQ('x', { handoff_stuck: { reason: 'y needs attention', can_resend: false } }), viewQ('y')] })));
    expect(region('q')).toHaveClass('needs-you');
    expect(within(region('q')).getByRole('link', { name: /^Switch to q/ })).toHaveAccessibleName('Switch to q — 1 stuck (its handoffs cannot go on by themselves)');
    act(() => stream('q').emit('snapshot', snapQ()));
    expect(region('q')).not.toHaveClass('needs-you');
  });

  it('the Goto palette still finds agents in collapsed projects', async () => {
    await twoTeams('/rig/r');
    const user = userEvent.setup();
    await user.keyboard('g');
    const dialog = screen.getByRole('dialog', { name: 'Go to agent' });
    expect(within(dialog).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['x — idle', 'y — idle', 'a — idle', 'b — idle']));
    await user.type(within(dialog).getByRole('combobox'), 'y-folder');
    await user.keyboard('{Enter}');
    expect(where()).toBe('/rig/q/agent/ops.y@q');
    expect(agentLinks('q')).toEqual(['x — idle', 'y — idle']);
  });
});

describe('done state', () => {
  const turnEnd = (seq: number) => ({
    event: ev(seq, { type: 'turn-ended', turn_id: `t${seq}`, status: 'completed' }),
    seat: seatView('a'),
  });

  it('marks an agent done when a turn ends, and clears it once you view the agent', async () => {
    await twoTeams('/rig/r', snapshot({ seats: [seatView('a', { activity: 'working', current_turn: 't11' }), seatView('b')] }));
    act(() => stream('r').emit('event', turnEnd(11)));
    const row = screen.getByRole('link', { name: 'a — done' });
    expect(row).toHaveTextContent('✓adone');
    expect(row.querySelector('.avatar.v-practice')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'a — done' })).toHaveTextContent('✓done');
    // "done" only means a turn ended, never that the work is correct: every tooltip says so.
    expect(row.querySelector('.st-done')).toHaveAttribute('data-tip', 'turn finished');
    expect(screen.getByRole('button', { name: 'a — done' }).querySelector('.st-done')).toHaveAttribute('data-tip', 'turn finished');
    expect(document.querySelector('.statusline .st-done, .statusline .tone-green')).toHaveAttribute('data-tip', 'turn finished');
    expect([...document.querySelectorAll('.rollup')].map((e) => e.getAttribute('title'))).toContain('1 done (turn finished)');
    const user = userEvent.setup();
    await user.click(row);
    expect(screen.getByRole('link', { name: 'a — idle' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(where()).toBe('/rig/r');
    expect(screen.getByRole('button', { name: 'a — idle' })).toBeInTheDocument();
    // Seen is remembered per browser.
    expect(JSON.parse(localStorage.getItem('sculptured.seen.v1')!)).toEqual({ 'dev.a@r': 11 });
  });

  it('comes back after a later turn ends', async () => {
    localStorage.setItem('sculptured.seen.v1', JSON.stringify({ 'dev.a@r': 11 }));
    resetSeenCache();
    // One request per team brings every agent's recent events (not one request per agent).
    vi.mocked(api.teamRecent).mockImplementation(async (rig): Promise<Record<string, EventRecord[]>> =>
      rig === 'r' ? { 'dev.a@r': [ev(11, { type: 'turn-ended', turn_id: 't11', status: 'completed' })] } : {},
    );
    await twoTeams();
    await waitFor(() => expect(api.teamRecent).toHaveBeenCalledWith('r', 60));
    expect(api.latestSeatEvents).not.toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: 'a — idle' })).toBeInTheDocument();
    act(() => stream('r').emit('event', turnEnd(14)));
    expect(screen.getByRole('link', { name: 'a — done' })).toBeInTheDocument();
  });
});

describe('Goto palette', () => {
  it('opens with g, searches name, team and folder, and Enter jumps', async () => {
    await twoTeams();
    const user = userEvent.setup();
    await user.keyboard('g');
    const dialog = screen.getByRole('dialog', { name: 'Go to agent' });
    const box = within(dialog).getByRole('combobox');
    expect(box).toHaveFocus();
    // One row per agent, grouped by team (all idle here, so by name).
    expect(within(dialog).getAllByRole('group').filter((g) => g.closest('[role="listbox"]')).map((g) => g.getAttribute('aria-label'))).toEqual(['q', 'r']);
    expect(within(dialog).getAllByRole('option')).toHaveLength(4);
    await user.type(box, 'y-folder');
    expect(within(dialog).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['y — idle']);
    expect(within(dialog).getByTestId('palette-folder')).toHaveTextContent('/work/y-folder');
    await user.clear(box);
    await user.type(box, 'q');
    expect(within(dialog).getAllByRole('option')).toHaveLength(2);
    await user.keyboard('{ArrowDown}');
    expect(within(dialog).getByRole('option', { selected: true })).toHaveAccessibleName('y — idle');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/rig/q/agent/ops.y@q');
  });

  it('Ctrl+K opens it too, and Esc closes it', async () => {
    await twoTeams();
    const user = userEvent.setup();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Go to agent' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/rig/r');
  });

  it('Alt+b, Alt+w, Alt+i and Alt+d filter by state; bare letters type', async () => {
    const r = snapshot({ seats: [seatView('a', { activity: 'working' }), seatView('b', { lifecycle: 'attention', lifecycle_reason: 'x' })] });
    await twoTeams('/rig/r', r);
    const user = userEvent.setup();
    await user.keyboard('g');
    const dialog = screen.getByRole('dialog', { name: 'Go to agent' });
    const names = () => within(dialog).queryAllByRole('option').map((o) => o.getAttribute('aria-label'));
    await user.keyboard('{Alt>}b{/Alt}');
    expect(names()).toEqual(['b — needs you']);
    expect(within(dialog).getByRole('button', { name: /blocked/ })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Alt>}b{/Alt}{Alt>}w{/Alt}');
    expect(names()).toEqual(['a — working']);
    await user.keyboard('{Alt>}w{/Alt}{Alt>}i{/Alt}');
    expect(names()).toEqual(['x — idle', 'y — idle']);
    await user.keyboard('{Alt>}i{/Alt}{Alt>}d{/Alt}');
    expect(names()).toEqual([]);
    await user.keyboard('{Alt>}d{/Alt}');
    await user.keyboard('bw');
    expect(within(dialog).getByRole('combobox')).toHaveValue('bw');
  });
});

describe('agent pane', () => {
  it('Esc returns to the same board with the selection and viewport kept', async () => {
    await twoTeams();
    const user = userEvent.setup();
    await user.keyboard('+');
    const zoomed = screen.getByTestId('graph-world').style.transform;
    await user.click(screen.getByRole('button', { name: 'b — idle' }));
    expect(where()).toBe('/rig/r/agent/dev.b@r');
    expect(screen.queryByTestId('graph-world')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(where()).toBe('/rig/r');
    expect(screen.getByTestId('graph-world').style.transform).toBe(zoomed);
    const b = screen.getByRole('button', { name: 'b — idle' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b).toHaveFocus();
  });

  it('Esc in the message box leaves the box first, keeping the draft', async () => {
    await twoTeams('/rig/r/agent/dev.a%40r');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Message'), 'draft');
    await user.keyboard('{Escape}');
    expect(where()).toBe('/rig/r/agent/dev.a@r');
    expect(screen.getByLabelText('Message')).toHaveValue('draft');
    await user.keyboard('{Escape}');
    expect(where()).toBe('/rig/r');
  });

  it('i interrupts the current turn', async () => {
    await twoTeams('/rig/r/agent/dev.a%40r', snapshot({ seats: [seatView('a', { activity: 'working', current_turn: 't1' }), seatView('b')] }));
    await userEvent.setup().keyboard('i');
    expect(api.interrupt).toHaveBeenCalledWith('dev.a@r', expect.any(String));
  });

  it('Enter sends, Shift+Enter adds a newline, Ctrl+C stays copy', async () => {
    await twoTeams('/rig/r/agent/dev.a%40r', snapshot({ seats: [seatView('a', { activity: 'working', current_turn: 't1' }), seatView('b')] }));
    const user = userEvent.setup();
    const box = screen.getByLabelText('Message');
    await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(box).toHaveValue('line one\nline two');
    expect(api.send).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(api.send).toHaveBeenCalledWith('dev.a@r', { text: 'line one\nline two', intent: 'inform', interrupt: false }, expect.any(String));
    await waitFor(() => expect(box).toHaveValue(''));
    await user.keyboard('{Control>}c{/Control}');
    expect(api.interrupt).not.toHaveBeenCalled();
  });

  it('Answer on a "needs you" box opens the pane with the message box focused', async () => {
    await twoTeams('/rig/r', snapshot({ seats: [seatView('a', { activity: 'waiting-input' }), seatView('b')] }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Answer a' }));
    expect(where()).toBe('/rig/r/agent/dev.a@r');
    expect(screen.getByLabelText('Message')).toHaveFocus();
  });
});

describe('notifications', () => {
  it('toasts a background agent that needs you until clicked, and keeps the count in the status line', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await twoTeams();
    expect(screen.getByTestId('needs-you-count')).toHaveTextContent('◉ 0 needs you');
    act(() =>
      stream('q').emit('event', {
        event: { ...ev(6, { type: 'seat-lifecycle-changed', lifecycle: 'attention', reason: 'stuck' }), subject: { kind: 'seat', id: 'ops.y@q' } },
        seat: viewQ('y', { lifecycle: 'attention', lifecycle_reason: 'stuck' }),
      }),
    );
    const toasts = screen.getByRole('region', { name: 'Notifications' });
    expect(toasts).toHaveTextContent('◉ y needs you · q');
    expect(screen.getByTestId('needs-you-count')).toHaveTextContent('◉ 1 needs you');
    act(() => vi.advanceTimersByTime(TOAST_MS * 3));
    expect(toasts).toHaveTextContent('y needs you');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(toasts).getByRole('button', { name: 'y needs you · q' }));
    expect(where()).toBe('/rig/q/agent/ops.y@q');
    expect(toasts).not.toHaveTextContent('y needs you');
  });

  it('toasts "done" when a background turn ends, and dismisses it after 6 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await twoTeams('/rig/r', snapshot(), snapQ({ seats: [viewQ('x', { activity: 'working', current_turn: 't' }), viewQ('y')] }));
    act(() =>
      stream('q').emit('event', {
        event: { ...ev(6, { type: 'turn-ended', turn_id: 't', status: 'completed' }), subject: { kind: 'seat', id: 'ops.x@q' } },
        seat: viewQ('x'),
      }),
    );
    const toasts = screen.getByRole('region', { name: 'Notifications' });
    expect(toasts).toHaveTextContent('✓ x done · q');
    act(() => vi.advanceTimersByTime(TOAST_MS - 100));
    expect(toasts).toHaveTextContent('x done');
    act(() => vi.advanceTimersByTime(200));
    expect(toasts).not.toHaveTextContent('x done');
  });

  it('does not toast the agent you are looking at, or what was already true on load', async () => {
    await twoTeams('/rig/r/agent/dev.a%40r', snapshot({ seats: [seatView('a', { activity: 'working' }), seatView('b', { lifecycle: 'attention', lifecycle_reason: 'x' })] }));
    act(() =>
      stream('r').emit('event', { event: ev(11, { type: 'turn-ended', turn_id: 't', status: 'completed' }), seat: seatView('a') }),
    );
    expect(within(screen.getByRole('region', { name: 'Notifications' })).queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('views and keys', () => {
  it('l switches to the list fallback and back', async () => {
    await twoTeams();
    const user = userEvent.setup();
    await user.keyboard('l');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('graph-world')).toBeNull();
    expect(localStorage.getItem('sculptured.run.view.v1')).toBe('"list"');
    await user.keyboard('l');
    expect(screen.getByTestId('graph-world')).toBeInTheDocument();
  });

  it('? opens the full keymap with a filter', async () => {
    await twoTeams();
    const user = userEvent.setup();
    await user.keyboard('?');
    const help = screen.getByRole('dialog', { name: 'Keys' });
    expect(help).toHaveTextContent('interrupt the current turn');
    // The ✓ filter is named for what it means: a turn finished, not work verified.
    expect(help).toHaveTextContent('filter: needs you or failed · working · idle · turn finished (✓)');
    expect(help).not.toHaveTextContent(/idle · done/);
    await user.type(within(help).getByRole('textbox', { name: 'Filter keys' }), 'zoom');
    expect(help).toHaveTextContent('zoom in or out');
    expect(help).not.toHaveTextContent('interrupt the current turn');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the workspace free of the bottom shortcut guide', async () => {
    await twoTeams();
    expect(screen.queryByRole('contentinfo', { name: 'Key hints' })).not.toBeInTheDocument();
  });

  it('bare letters do nothing while typing', async () => {
    await twoTeams('/rig/r/agent/dev.a%40r');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Message'), 'g?l');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('g?l');
  });

  it('uses no OpenRig words with the sidebar, graph, palette and help open', async () => {
    const q = snapQ({ seats: [viewQ('x', { lifecycle: 'attention', lifecycle_reason: "host lost this seat's process" }), viewQ('y')] });
    await twoTeams('/rig/r', snapshot(), q);
    const user = userEvent.setup();
    // The app root (the test's location probe sits outside it).
    const found = () => openRigWords(document.querySelector<HTMLElement>('.app')!);
    expect(found()).toEqual([]);
    await user.keyboard('g');
    expect(found()).toEqual([]);
    await user.keyboard('{Escape}?');
    expect(found()).toEqual([]);
    await user.keyboard('{Escape}l');
    expect(found()).toEqual([]);
  });
});

describe('workspace areas and panels', () => {
  it('shows the team list by default, ignores old panel preferences, and reveals all app controls', async () => {
    localStorage.clear();
    localStorage.setItem('sculptured.panels.v2.left', 'false');
    localStorage.setItem('sculptured.panels.right', 'true');
    localStorage.setItem('sculptured.run.view.v1', JSON.stringify('graph'));
    await twoTeams();
    const user = userEvent.setup();
    const graph = screen.getByTestId('graph-world');
    expect(screen.getByRole('navigation', { name: 'Agents' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Workspace details' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keys' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go to agent' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'App menu' }));
    expect(screen.getByRole('button', { name: 'Keys' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to agent' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'App menu' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Keys' })).toBeNull();
    await user.click(screen.getByRole('main'));
    expect(screen.getByRole('button', { name: 'App menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('graph-world')).toBe(graph);
  });

  it('toggles panels independently and remembers the desktop choice', async () => {
    await twoTeams();
    const user = userEvent.setup();
    const graph = screen.getByTestId('graph-world');
    await user.click(screen.getByRole('button', { name: 'App menu' }));
    await user.click(screen.getByRole('button', { name: 'Hide projects panel' }));
    expect(screen.queryByRole('navigation', { name: 'Agents' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Workspace details' })).toBeInTheDocument();
    expect(localStorage.getItem(LEFT_PANEL_KEY)).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Hide details panel' }));
    expect(screen.queryByRole('complementary', { name: 'Workspace details' })).toBeNull();
    expect(localStorage.getItem(RIGHT_PANEL_KEY)).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Show projects panel' }));
    await user.click(screen.getByRole('button', { name: 'Show details panel' }));
    expect(screen.getByTestId('graph-world')).toBe(graph);
    expect(where()).toBe('/rig/r');
  });

  it('restores hidden panels on mount while retaining the workspace', async () => {
    localStorage.setItem(LEFT_PANEL_KEY, 'false');
    localStorage.setItem(RIGHT_PANEL_KEY, 'false');
    await twoTeams();
    await userEvent.click(screen.getByRole('button', { name: 'App menu' }));
    expect(screen.getByRole('button', { name: 'Show projects panel' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show details panel' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('graph-world')).toBeInTheDocument();
  });

  it('opens the private Library separately from Community and returns to the workspace', async () => {
    await twoTeams('/rig/r/agent/dev.a%40r');
    const user = userEvent.setup();
    expect(screen.queryByRole('navigation', {name:'Main navigation'})).toBeNull();
    await user.click(screen.getByRole('button', {name:'App menu'}));
    for (const name of ['Monitor', 'Examples', 'Docs', 'Settings', 'Account']) expect(screen.queryByRole('link', {name})).toBeNull();
    await user.click(screen.getByRole('link', {name:'Library'}));
    expect(where()).toBe('/library/groups');
    expect(screen.getByRole('heading',{name:'Private Library'})).toBeVisible();
    expect(screen.getByRole('link',{name:'Community account'})).toHaveAttribute('href','/community');
    await user.keyboard('n');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'App menu' }));
    await user.click(screen.getByRole('link', { name: 'Workspace' }));
    expect(where()).toBe('/rig/r/agent/dev.a@r');
    expect(api.send).not.toHaveBeenCalled();
    expect(api.interrupt).not.toHaveBeenCalled();
  });
});

describe('narrow screens', () => {
  const mq = (matches: boolean) =>
    vi.fn().mockImplementation((q: string) => ({ matches, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  afterEach(() => {
    // @ts-expect-error jsdom has no matchMedia; restore that.
    delete window.matchMedia;
  });

  it('the sidebar is the home list and the graph defaults to the list', async () => {
    localStorage.removeItem('sculptured.run.view.v1');
    window.matchMedia = mq(true);
    vi.mocked(api.listRigs).mockResolvedValue([summary('r')]);
    renderAt('/');
    await waitFor(() => expect(api.listRigs).toHaveBeenCalled());
    await act(async () => {});
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => stream('r').emit('snapshot', snapshot()));
    expect(where()).toBe('/');
    const home = screen.getByRole('navigation', { name: 'Agents' });
    await userEvent.setup().click(within(home).getByRole('link', { name: 'r' }));
    expect(where()).toBe('/rig/r');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('navigation', { name: 'Agents' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^projects/ })).toHaveAttribute('href', '/');
  });

  it('opens one mobile panel at a time without leaving the Library', async () => {
    window.matchMedia = mq(true);
    await twoTeams('/library/runs');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'App menu' }));
    await user.click(screen.getByRole('button', { name: 'Show details panel' }));
    expect(screen.getByRole('complementary', { name: 'Workspace details' })).toBeInTheDocument();
    expect(document.querySelector('.workspace-stage')).toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Show projects panel' }));
    expect(screen.queryByRole('complementary', { name: 'Workspace details' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Hide projects panel' }));
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
    expect(where()).toBe('/library/runs');
  });

  it('the home list shows the remembered project’s agents, and a tap switches project', async () => {
    window.matchMedia = mq(true);
    localStorage.setItem(PROJECT_KEY, JSON.stringify('q'));
    await twoTeams('/');
    const home = screen.getByRole('navigation', { name: 'Agents' });
    expect(within(home).getByRole('link', { name: 'x — idle' })).toBeInTheDocument();
    expect(within(home).queryByRole('link', { name: 'a — idle' })).toBeNull();
    await userEvent.setup().click(within(home).getByRole('link', { name: 'Switch to r — 2 agents' }));
    expect(where()).toBe('/rig/r');
    expect(JSON.parse(localStorage.getItem(PROJECT_KEY)!)).toBe('r');
  });
});

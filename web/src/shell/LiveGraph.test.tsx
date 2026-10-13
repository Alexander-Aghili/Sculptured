import { act, createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveGraph, chipRow, edgeGeometry, forgetViewports, routeEdges, type GraphHandle } from './LiveGraph';
import { AgentList } from './AgentList';
import { teamAgents, type AgentRow } from './model';
import { compiledRig, seatView, teamDraft, draftAgent } from '../test-fixtures';
import type { Layout } from '../layout';
import type { SeatView } from '../generated/SeatView';
import type { AgentActivity } from '../herdr';

const seats = { 'dev.a@r': seatView('a'), 'dev.b@r': seatView('b', { lifecycle: 'stopped', activity: 'unknown' }) };

function rows(s: Record<string, SeatView>, activity: Record<string, AgentActivity> = {}, names = {}): Record<string, AgentRow> {
  return Object.fromEntries(teamAgents('r', compiledRig(), s, activity, names).map((a) => [a.id, a]));
}

function graph(over: Partial<Parameters<typeof LiveGraph>[0]> = {}) {
  return (
    <LiveGraph rig="r" compiled={compiledRig()} agents={rows(seats)} onOpen={() => {}} onAnswer={() => {}} now={0} {...over} />
  );
}

beforeEach(() => { forgetViewports(); localStorage.clear(); });

describe('Live Team Graph', () => {
  it('remembers hidden groups, removes internal arrows and restores the current live status', async () => {
    const user=userEvent.setup();
    const {unmount,rerender}=render(graph());
    const world=screen.getByTestId('graph-world'), transform=world.style.transform;
    const group=compiledRig().pods[0];
    await user.click(screen.getByRole('button',{name:'Hide contents of '+group.label}));
    expect(screen.queryByRole('button',{name:'a — idle'})).toBeNull();
    expect(screen.queryByTestId('edge-dev.a@r-dev.b@r')).toBeNull();
    expect(screen.queryByTestId('edge-label-dev.a@r-dev.b@r')).toBeNull();
    expect(world.style.transform).toBe(transform);
    const updated=rows({...seats,'dev.a@r':seatView('a',{activity:'working',current_tool:'Bash'})});
    rerender(graph({agents:updated}));
    expect(screen.queryByRole('button',{name:'a — working'})).toBeNull();
    unmount();
    render(graph({agents:updated}));
    const show=screen.getByRole('button',{name:'Show contents of '+group.label});
    expect(show).toHaveAttribute('aria-expanded','false');
    show.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('button',{name:'a — working'})).toBeVisible();
    expect(screen.getByTestId('edge-dev.a@r-dev.b@r')).toBeInTheDocument();
  });

  it('shows workflow routes and Input alongside live agent status at the saved positions', async () => {
    const onWorkflow = vi.fn();
    const draft = teamDraft({ id:'r', agents:['a','b'].map(id=>draftAgent(id, {group_id:'dev'})), workflow:{input:'Course notes',dispatcher:'a',collector:'b',entry:'build',max_tasks:24,max_steps:12,stages:[{id:'build',name:'Build',agent:'a',routes:{accept:null}}]} });
    render(graph({ draft, onWorkflow, compiled:{...compiledRig(),edges:[]} }));
    expect(screen.getByRole('button',{name:'a — idle'})).toBeVisible();
    expect(screen.getByRole('button',{name:'b — stopped'})).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Input: links, notes and ideas'}));
    expect(onWorkflow).toHaveBeenLastCalledWith('input');
    await user.click(screen.getByRole('button',{name:'Workflow route: accept · all N accepted'}));
    expect(onWorkflow).toHaveBeenLastCalledWith({stage:'build'});
    expect(screen.getByTestId('graph-viewport')).toBeInTheDocument();
  });
  it('draws enforced connections solid and design-intent ones dashed', () => {
    render(graph());
    expect(screen.getByTestId('edge-dev.a@r-dev.b@r')).toHaveClass('edge', 'enforced');
    expect(screen.getByTestId('edge-dev.b@r-dev.a@r')).toHaveClass('edge', 'intent');
  });

  it('labels every connection with its own element on its own background, outside the SVG', () => {
    render(graph());
    const fwd = screen.getByTestId('edge-label-dev.a@r-dev.b@r');
    const back = screen.getByTestId('edge-label-dev.b@r-dev.a@r');
    expect(fwd).toHaveTextContent('hands work to');
    expect(back).toHaveTextContent('watches · not enforced');
    for (const label of [fwd, back]) {
      expect(label.tagName).toBe('SPAN');
      expect(label).toHaveClass('edge-label');
      // An HTML label on its own background is never clipped by the SVG viewport.
      expect(label.closest('svg')).toBeNull();
      expect(label.style.left).not.toBe('');
      expect(label.style.top).not.toBe('');
    }
    // The two labels sit at different points: the return connection arcs below.
    expect(fwd.style.top).not.toBe(back.style.top);
  });

  it('puts each label at the midpoint of its curve', () => {
    const a = { x: 0, y: 0, w: 200, h: 200 };
    const b = { x: 320, y: 0, w: 200, h: 200 };
    const g = edgeGeometry(a, b);
    expect(g.mid).toEqual({ x: 260, y: 100 });
    expect(g.d.startsWith('M200,100 C')).toBe(true);
  });

  it('arcs a connection over a box it would otherwise cross', () => {
    const box = (x: number) => ({ x, y: 0, w: 200, h: 200 });
    const edge = { kind: 'delegates_to' as const, from: 'a', to: 'c', enforced: true };
    const routes = routeEdges([edge], { a: box(0), b: box(320), c: box(640) });
    expect(routes.get(edge)!.mid.y).toBeLessThan(0);
    const clear = routeEdges([edge], { a: box(0), c: box(640) });
    expect(clear.get(edge)!.mid.y).toBe(100);
  });

  it('renders one box per agent, named "{name} — {state}", with glyph plus word', () => {
    render(graph());
    expect(screen.getByRole('button', { name: 'a — idle' })).toHaveTextContent('○idle');
    expect(screen.getByRole('button', { name: 'b — stopped' })).toHaveTextContent('■stopped');
  });

  it('shows the herdr states as glyph plus word', () => {
    const s = {
      'dev.a@r': seatView('a', { activity: 'working', current_tool: 'Bash' }),
      'dev.b@r': seatView('b', { activity: 'waiting-input' }),
    };
    render(graph({ agents: rows(s) }));
    const a = screen.getByRole('button', { name: 'a — working' });
    expect(a).toHaveTextContent('⣟working · bash');
    expect(a.querySelector('.glyph')).toHaveClass('spin');
    expect(screen.getByRole('button', { name: 'b — needs you' })).toHaveTextContent('◉needs you');
  });

  it('shows unknown for an agent with no status yet', () => {
    render(graph({ agents: rows({ 'dev.a@r': seatView('a') }) }));
    expect(screen.getByRole('button', { name: 'b — unknown' })).toHaveTextContent('∅unknown');
  });

  it('shows two tool chips and +N for the rest, the last reply verbatim, tokens and age', () => {
    const activity: Record<string, AgentActivity> = {
      'dev.a@r': {
        chips: [
          { name: 'edit', count: 1, status: 'running', ms: null, startedAt: Date.now() },
          { name: 'bash', count: 5, status: 'ok', ms: 300, startedAt: 0 },
          { name: 'read', count: 1, status: 'error', ms: 20, startedAt: 0 },
        ],
        lastText: 'all tests pass\nsecond line',
        lastTurnEndSeq: null,
      },
    };
    const s = { ...seats, 'dev.a@r': seatView('a', { activity: 'working', tokens_in: 10, tokens_out: 5, last_event_ms: 0 }) };
    render(graph({ agents: rows(s, activity), now: 4 * 60_000 }));
    const box = screen.getByRole('button', { name: 'a — working' }).closest('.agent-box') as HTMLElement;
    const chips = [...box.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips[0]).toMatch(/^⚒ edit \d\.\ds …$/);
    expect(chips.slice(1)).toEqual(['⚒ bash ×5 ✓', '+1']);
    expect(within(box).getByText('› all tests pass')).toHaveAttribute('data-raw-evidence');
    expect(box).toHaveTextContent('15 tokens');
    expect(box).toHaveTextContent('4m');
    expect(screen.getByRole('button', { name: 'b — stopped' }).closest('.agent-box')).toHaveTextContent('tokens unknown');
  });

  it('clicking or pressing Enter on a box opens the agent', async () => {
    const onOpen = vi.fn();
    render(graph({ onOpen }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'a — idle' }));
    screen.getByRole('button', { name: 'b — stopped' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen.mock.calls).toEqual([['dev.a@r'], ['dev.b@r']]);
  });

  it('gives a "needs you" box a red state and an Answer button', async () => {
    const onAnswer = vi.fn();
    const reason = 'launch failed: working directory does not exist: /a/very/long/path/that/would/be/clipped';
    const s = { ...seats, 'dev.a@r': seatView('a', { lifecycle: 'attention', lifecycle_reason: reason }) };
    render(graph({ agents: rows(s), onAnswer }));
    const box = screen.getByRole('button', { name: 'a — needs you' }).closest('.agent-box') as HTMLElement;
    expect(box).toHaveClass('st-needs-you');
    const r = within(box).getByText(reason);
    expect(r).toHaveClass('reason', 'clamp');
    expect(r).toHaveAttribute('title', reason);
    expect(r).toHaveAttribute('data-raw-evidence');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Answer a' }));
    expect(onAnswer).toHaveBeenCalledWith('dev.a@r');
  });

  it("does not show an attention agent's old tool as current", () => {
    const s = { ...seats, 'dev.a@r': seatView('a', { lifecycle: 'attention', activity: 'working', current_tool: 'Bash', current_turn: 't1' }) };
    const activity = { 'dev.a@r': { chips: [{ name: 'bash', count: 1, status: 'running' as const, ms: null, startedAt: 0 }], lastText: null, lastTurnEndSeq: null } };
    render(graph({ agents: rows(s, activity) }));
    const box = screen.getByRole('button', { name: 'a — needs you' });
    expect(box).not.toHaveTextContent('bash');
    expect(box).not.toHaveTextContent('working');
  });

  it('marks the selected agent', () => {
    render(graph({ selected: 'dev.b@r' }));
    expect(screen.getByRole('button', { name: 'b — stopped' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'a — idle' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('graph stability', () => {
  const slots = () => [...document.querySelectorAll<HTMLElement>('.card-slot')].map((e) => e.getAttribute('style'));

  it('does not move boxes when statuses change', () => {
    const { rerender } = render(graph());
    const before = slots();
    const changed = {
      ...seats,
      'dev.a@r': seatView('a', { lifecycle: 'attention', lifecycle_reason: 'a very long reason that would otherwise grow the box', current_tool: 'Bash' }),
    };
    rerender(graph({ agents: rows(changed) }));
    expect(slots()).toEqual(before);
    expect(before).toHaveLength(2);
  });

  it('box slots are the 200 × 200 card budget', () => {
    render(graph());
    for (const el of document.querySelectorAll<HTMLElement>('.card-slot')) {
      expect(el.style.width).toBe('200px');
      expect(el.style.height).toBe('200px');
    }
  });

  it('keeps zoom and pan across live updates and remounts', () => {
    const ref = createRef<GraphHandle>();
    const { rerender, unmount } = render(graph({ ref }));
    const world = () => screen.getByTestId('graph-world').style.transform;
    act(() => ref.current!.zoomBy(2));
    const zoomed = world();
    expect(zoomed).toContain('scale(2)');
    rerender(graph({ ref, agents: rows({ ...seats, 'dev.a@r': seatView('a', { activity: 'working' }) }) }));
    expect(world()).toBe(zoomed);
    unmount();
    render(graph());
    expect(world()).toBe(zoomed);
  });

  it('pans by dragging empty space', () => {
    render(graph());
    const vp = screen.getByTestId('graph-viewport');
    const before = screen.getByTestId('graph-world').style.transform;
    fireEvent.pointerDown(vp, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130 });
    fireEvent.pointerUp(window, { clientX: 160, clientY: 130 });
    const after = screen.getByTestId('graph-world').style.transform;
    expect(after).not.toBe(before);
    expect(after).toContain('translate(108px, 78px)');
  });
});

describe('list fallback', () => {
  it('shows the same agents and states, and connections as sentences', () => {
    render(<AgentList compiled={compiledRig()} agents={rows(seats)} onOpen={() => {}} now={0} />);
    const group = screen.getByRole('region', { name: 'group Dev' });
    expect(within(group).getByRole('button', { name: 'a — idle' })).toHaveTextContent('○idle');
    expect(within(group).getByRole('button', { name: 'b — stopped' })).toHaveTextContent('■stopped');
    const edges = screen.getByRole('region', { name: 'Connections' });
    expect(edges).toHaveTextContent('a hands work to b');
    expect(edges).toHaveTextContent('b watches a (not enforced)');
  });

  it('shows the full reason, not clamped', () => {
    const s = { 'dev.a@r': seatView('a', { lifecycle: 'failed', lifecycle_reason: 'boom' }), 'dev.b@r': seatView('b') };
    render(<AgentList compiled={compiledRig()} agents={rows(s)} onOpen={() => {}} now={0} />);
    expect(screen.getByText('boom')).not.toHaveClass('clamp');
    expect(screen.getByText('boom')).toHaveAttribute('data-raw-evidence');
  });
});

describe('graph with a persisted layout', () => {
  const box = (x: number, y: number) => ({ x, y, w: 200, h: 200 });

  it('places boxes at the given positions instead of computing them', () => {
    const layout: Layout = { pods: {}, seats: { 'dev.a@r': box(500, 40), 'dev.b@r': box(40, 300) }, width: 700, height: 500 };
    render(graph({ layout }));
    const slot = (name: RegExp) => screen.getByRole('button', { name }).closest('.card-slot') as HTMLElement;
    expect(slot(/^a — /).style.left).toBe('500px');
    expect(slot(/^b — /).style.top).toBe('300px');
  });

  it('draws a group only when it has a box', () => {
    const layout: Layout = { pods: {}, seats: { 'dev.a@r': box(40, 40), 'dev.b@r': box(300, 40) }, width: 600, height: 300 };
    const { container } = render(graph({ layout }));
    expect(container.querySelectorAll('.group-box')).toHaveLength(0);
  });

  it('lists agents without a position and shows positions without an agent as not started', () => {
    const layout: Layout = { pods: {}, seats: { 'dev.a@r': box(40, 40), 'dev.new@r': box(300, 40) }, width: 600, height: 300 };
    render(graph({ layout, names: { 'dev.new@r': 'Helper' } }));
    const off = screen.getByRole('region', { name: 'Not on the canvas' });
    expect(within(off).getByRole('button', { name: /^b — / })).toBeInTheDocument();
    expect(screen.getByText('Helper — not started yet')).toBeInTheDocument();
  });
});

describe('chipRow', () => {
  const chip = (name: string) => ({ name, count: 1, status: 'ok' as const, ms: 1, startedAt: 0 });

  it('keeps one row: the first two tools, and how many more the turn used', () => {
    expect(chipRow([chip('a')], 1)).toEqual({ shown: [chip('a')], more: 0 });
    expect(chipRow([chip('a'), chip('b'), chip('c')], 5)).toEqual({ shown: [chip('a'), chip('b')], more: 3 });
  });
});

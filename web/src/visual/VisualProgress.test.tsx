import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { TEAM_START_ACTOR } from '../conversation';
import type { EventBody } from '../generated/EventBody';
import type { EventRecord } from '../generated/EventRecord';
import { STATES } from '../herdr';
import { ev } from '../test-fixtures';
import { openRigWords } from '../test-vocab';
import { plainLine, VisualProgress } from './VisualProgress';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return { ...m, api: { ...m.api, latestSeatEvents: vi.fn() } };
});

const at = (seq: number, ms: number, body: EventBody, actor?: EventRecord['actor']): EventRecord => ({ ...ev(seq, body), at_ms: ms, ...(actor ? { actor } : {}) });
const call = (seq: number, ms: number, id: string, name: string, input: unknown, turn = 't1') =>
  at(seq, ms, { type: 'tool-called', turn_id: turn, call_id: id, name, input: input as never, parent_call_id: null });
const result = (seq: number, ms: number, id: string, output: string, isError = false, turn = 't1') =>
  at(seq, ms, { type: 'tool-resulted', turn_id: turn, call_id: id, output, is_error: isError });

function session(): EventRecord[] {
  return [
    at(1, 0, { type: 'tenure-started', tenure: 1, cause: 'fresh', driver: 'claude', native_session_id: null, caps: {} as never }),
    at(2, 10, { type: 'message-queued', message_id: 'job', intent: 'inform', text: 'Build the login page' }, { kind: 'system', id: TEAM_START_ACTOR }),
    at(3, 100, { type: 'turn-started', turn_id: 't1' }),
    at(4, 110, { type: 'message-consumed', message_id: 'job', turn_id: 't1' }),
    call(5, 200, 'r1', 'Read', { file_path: '/w/src/App.tsx' }),
    result(6, 250, 'r1', 'export default App'),
    call(7, 300, 'w1', 'Write', { file_path: '/w/src/Login.tsx', content: 'export const Login = 1;' }),
    result(8, 410, 'w1', 'File created successfully at: /w/src/Login.tsx'),
    call(9, 500, 'b1', 'Bash', { command: 'npm test' }),
    result(10, 2500, 'b1', 'Exit code 1\nTests: 1 failed, 4 passed', true),
    at(11, 2800, { type: 'agent-text', turn_id: 't1', text: 'Added the login page.\nAll tests pass now.' }),
    at(12, 3000, { type: 'turn-ended', turn_id: 't1', status: 'completed' }),
    at(13, 4000, { type: 'message-queued', message_id: 'op', intent: 'inform', text: 'Fix the failing test' }, { kind: 'human', id: 'operator' }),
    at(14, 4100, { type: 'turn-started', turn_id: 't2' }),
    at(15, 4110, { type: 'message-consumed', message_id: 'op', turn_id: 't2' }),
    call(16, 4200, 'e2', 'Edit', { file_path: '/w/src/Login.tsx', old_string: 'export const Login = 1;', new_string: 'export const Login = 2;' }, 't2'),
  ];
}

function renderVisual(events = session(), onJump = vi.fn()) {
  vi.mocked(api.latestSeatEvents).mockResolvedValue(events);
  const r = render(<VisualProgress seatId="dev.a@r" feed={[]} epoch={0} state={STATES.working} onJump={onJump} />);
  return { ...r, onJump };
}

describe('VisualProgress', () => {
  beforeEach(() => vi.mocked(api.latestSeatEvents).mockReset());

  it('sums up the session at the top', async () => {
    const { container } = renderVisual();
    const strip = await screen.findByRole('region', { name: 'Summary' });
    await vi.waitFor(() => expect(strip).toHaveTextContent('Turns2'));
    expect(strip).toHaveTextContent('working');
    expect(strip).toHaveTextContent('Tool calls4');
    expect(strip).toHaveTextContent('Files changed1 · 1 read');
    expect(strip).toHaveTextContent('Commands1');
    expect(strip).toHaveTextContent('Checks1 · 1 error result');
    expect(strip).toHaveTextContent('Last activity');
    // What it is doing right now, from the last turn's running call.
    const now = document.querySelector('.vp-now')!;
    expect(now).toHaveTextContent('Now');
    expect(now).toHaveTextContent('Turn 2 · running · Edit /w/src/Login.tsx');
    expect(within(now as HTMLElement).getByRole('button', { name: 'Show turn' })).toBeInTheDocument();
    expect(openRigWords(container)).toEqual([]);
  });

  it('draws one phase per turn with its start, tool nodes and reply; nodes jump to the transcript', async () => {
    const { onJump } = renderVisual();
    const process = await screen.findByRole('region', { name: 'Process' });
    await within(process).findAllByRole('listitem');
    const phases = [...process.querySelectorAll<HTMLElement>('.vp-phase')];
    expect(phases).toHaveLength(2);
    expect(phases[0]).toHaveTextContent('Job · sent at start');
    expect(phases[0]).toHaveTextContent('Build the login page');
    expect(phases[0]).toHaveTextContent('✓ completed');
    expect(phases[0]).toHaveTextContent('◇ reported');
    expect(phases[0]).toHaveTextContent('Added the login page.');
    expect(phases[1]).toHaveTextContent('You: Fix the failing test');
    expect(phases[1]).toHaveTextContent('running');
    const failed = within(phases[0]).getByRole('button', { name: 'Bash: npm test — ✗ error' });
    expect(failed).toHaveTextContent('✗');
    const user = userEvent.setup();
    await user.click(failed);
    expect(onJump).toHaveBeenCalledWith('t-b1-9');
    await user.click(within(phases[0]).getByRole('button', { name: /Job · sent at start/ }));
    expect(onJump).toHaveBeenLastCalledWith('m-job');
    await user.click(within(phases[0]).getByRole('button', { name: /Added the login page/ }));
    expect(onJump).toHaveBeenLastCalledWith('a-11');
  });

  it('clamps a turn to its first lines; Show more opens the whole message and reply in the card', async () => {
    renderVisual();
    const process = await screen.findByRole('region', { name: 'Process' });
    const [first] = await within(process).findAllByRole('listitem');
    const reply = first.querySelector('.vp-reply-text')!;
    expect(reply).toHaveTextContent('Added the login page.');
    expect(reply).not.toHaveTextContent('All tests pass now.');
    const user = userEvent.setup();
    await user.click(within(first).getByRole('button', { name: 'Show more' }));
    expect(first.querySelector('.vp-card')).toHaveAttribute('data-open', 'true');
    expect(reply).toHaveTextContent('All tests pass now.');
    await user.click(within(first).getByRole('button', { name: 'Show less' }));
    expect(reply).not.toHaveTextContent('All tests pass now.');
  });

  it('moves between a phase’s nodes with the arrow keys, one tab stop per row', async () => {
    renderVisual();
    const process = await screen.findByRole('region', { name: 'Process' });
    const row = (await within(process).findAllByRole('group', { name: /tool calls/ }))[0];
    const nodes = within(row).getAllByRole('button');
    expect(nodes.map((n) => n.tabIndex)).toEqual([0, -1, -1]);
    nodes[0].focus();
    const user = userEvent.setup();
    await user.keyboard('{ArrowRight}');
    expect(nodes[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(nodes[2]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(nodes[0]).toHaveFocus();
  });

  it('shows the files built and changed, and a file’s edits with the turn that made them', async () => {
    const { onJump } = renderVisual();
    const files = await screen.findByRole('region', { name: 'Built and changed' });
    await within(files).findByText('Login.tsx');
    expect(files).toHaveTextContent('1 changed · 1 read only');
    const login = within(files).getByRole('button', { name: /Login\.tsx/ });
    expect(login).toHaveTextContent('edited');
    const user = userEvent.setup();
    await user.click(login);
    expect(login).toHaveAttribute('aria-pressed', 'true');
    const detail = within(files).getByRole('region', { name: /Changes to/ });
    expect(detail).toHaveTextContent('Turn 1 · created');
    expect(detail).toHaveTextContent('Turn 2 · edited');
    expect(detail.querySelector('.dl-add')).toHaveTextContent('export const Login = 1;');
    await user.click(within(detail).getAllByRole('button', { name: 'Show in transcript' })[1]);
    expect(onJump).toHaveBeenCalledWith('t-e2-16');
    // How the list was made is stated.
    expect(files).toHaveTextContent('◆ observed');
  });

  it('lists checks with only what their result shows, and the agent’s claims as reported', async () => {
    renderVisual();
    const checks = await screen.findByRole('region', { name: 'Checks' });
    await within(checks).findByText('npm test');
    expect(checks).toHaveTextContent('◆ observed');
    expect(checks).toHaveTextContent('✗ error result · exit 1');
    expect(within(checks).getByText('Tests: 1 failed, 4 passed')).toHaveAttribute('data-raw-evidence');
    expect(checks).toHaveTextContent('◇ reported');
    expect(checks).toHaveTextContent('All tests pass now.');
    expect(checks).not.toHaveTextContent('verified');
  });

  it('has a text list fallback with every step', async () => {
    renderVisual();
    await screen.findByRole('region', { name: 'Process' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'List' }));
    const list = await screen.findByRole('list', { name: 'Process as a list' });
    expect(list).toHaveTextContent('Turn 1');
    expect(list).toHaveTextContent('Read /w/src/App.tsx — ✓ ok');
    expect(list).toHaveTextContent('Bash npm test — ✗ error');
    expect(list).toHaveTextContent('Edit /w/src/Login.tsx — running');
  });

  it('draws only the latest turns of a long session, with a way to show earlier ones', async () => {
    const events: EventRecord[] = [];
    for (let i = 1; i <= 45; i++) {
      events.push(at(i * 2, i * 10, { type: 'turn-started', turn_id: `t${i}` }));
      events.push(at(i * 2 + 1, i * 10 + 5, { type: 'turn-ended', turn_id: `t${i}`, status: 'completed' }));
    }
    renderVisual(events);
    const process = await screen.findByRole('region', { name: 'Process' });
    await vi.waitFor(() => expect(within(process).getAllByRole('listitem')).toHaveLength(30));
    await userEvent.setup().click(within(process).getByRole('button', { name: 'Show 15 earlier turns' }));
    expect(within(process).getAllByRole('listitem')).toHaveLength(45);
  });

  it('says so when there is nothing yet, and uses no OpenRig words', async () => {
    const { container } = renderVisual([]);
    expect(await screen.findByText(/No turns yet/)).toBeInTheDocument();
    expect(openRigWords(container)).toEqual([]);
  });

  it('shows one-line summaries without Markdown markers, words unchanged', () => {
    expect(plainLine('## Login page added')).toBe('Login page added');
    expect(plainLine('Sure, see *this* and **that** in `a.ts`')).toBe('Sure, see this and that in a.ts');
    expect(plainLine('- item one')).toBe('item one');
    expect(plainLine('2 * 3 = 6 and snake_case_name')).toBe('2 * 3 = 6 and snake_case_name');
  });
});

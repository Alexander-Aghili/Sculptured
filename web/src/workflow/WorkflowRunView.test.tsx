import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { teamDraft, draftAgent } from '../test-fixtures';
import { WorkflowRunView } from './WorkflowRunView';
import { api } from '../api';
import type { Workflow } from '../generated/Workflow';
import type { WorkflowRun } from '../generated/WorkflowRun';

vi.mock('../api', async orig => { const m = await orig<typeof import('../api')>(); return { ...m, api: { ...m.api, workflow: vi.fn(), decideWorkflow: vi.fn().mockResolvedValue({ decided: 'bug-1' }), resumeGuard: vi.fn().mockResolvedValue({ resumed: true }), decisions: vi.fn().mockResolvedValue([{ id: 'e1', at_ms: 1, author: 'a person', text: 'Prefer small fixes.', source: 'person', hidden_ms: null }]), addDecision: vi.fn().mockResolvedValue({ id: 'e2' }), hideDecision: vi.fn().mockResolvedValue({ hidden: 'e1' }) } }; });

const config: Workflow = { input: '', dispatcher: 'dispatch', collector: 'frontend', entry: 'build', max_tasks: 4, max_steps: 12, stages: [
  { id: 'build', name: 'Build', agent: 'build', routes: { ready: 'tests' } },
  { id: 'tests', name: 'Tests', agent: '', kind: 'check', command: 'npm test', routes: { passed: 'chief', failed: 'build' } },
  { id: 'chief', name: 'Sign-off', agent: '', kind: 'human', prompt: 'Ship it?', routes: { ship: null, rework: 'build' } },
] };
const run: WorkflowRun = { rig: 'team', start_seq: 7, batch_id: 'b', summary: 's', config,
  assembly: { input: { id: 'assembly', title: 'Assemble', context: 'c' }, stage: 'assembly', status: 'queued', assignment: null, history: [], problem: null },
  tasks: [{ input: { id: 'bug-1', title: 'Fix login', context: 'c' }, stage: 'chief', status: 'waiting', assignment: null, waiting: { stage: 'chief', since_ms: 1 }, problem: null, history: [
    { assignment: 'a1', stage: 'build', agent: 'build', outcome: 'ready', result: 'Changed login.ts', at_ms: 1 },
    { assignment: 'a2', stage: 'tests', agent: '', outcome: 'passed', result: 'Check passed: npm test', at_ms: 2, by: 'check', evidence: '$ npm test\nexit 0 · 900 ms\n64 passing' },
  ] }] };

it('shows a waiting item as a decision card with its evidence and one button per outcome', async () => {
  vi.mocked(api.workflow).mockResolvedValue({ config, run, active: true });
  const user = userEvent.setup();
  render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: config })} /></MemoryRouter>);
  const card = await screen.findByRole('region', { name: 'Fix login: Sign-off' });
  expect(within(card).getByText('Ship it?')).toBeInTheDocument();
  expect(within(card).getByText(/verified check/)).toBeInTheDocument();
  expect(within(card).getByText(/exit 0/)).toBeInTheDocument();
  await user.type(within(card).getByLabelText('Note (optional)'), 'Looks right');
  await user.click(within(card).getByRole('button', { name: 'ship' }));
  expect(api.decideWorkflow).toHaveBeenCalledWith('team', { task: 'bug-1', outcome: 'ship', note: 'Looks right', start_seq: 7, log: false });
  expect(screen.getAllByText(/agent-reported/).length).toBeGreaterThan(0);
});

it('shows panel votes, the item folder and merge results only for items that have them', async () => {
  const withItems: WorkflowRun = { ...run, tasks: [{ input: { id: 'bug-2', title: 'Fix signup', context: 'c' }, stage: 'merge', status: 'complete', assignment: null, problem: null, copy: '/c/t/item-bug-2', history: [
    { assignment: 'p1', stage: 'review', agent: 'panel', outcome: 'changes', result: 'r', at_ms: 1, votes: { correctness: 'approved', safety: 'changes' }, panel: [{ agent: 'correctness', assignment: 'r1', outcome: 'approved', result: 'ok' }, { agent: 'safety', assignment: 'r2', outcome: 'changes', result: 'no' }] },
    { assignment: 'm1', stage: 'merge', agent: '', outcome: 'merged', result: 'Merged into the project\'s branch.', at_ms: 2, by: 'sculptured', evidence: 'a.txt | 2 +-' },
  ] }] };
  vi.mocked(api.workflow).mockResolvedValue({ config, run: withItems, active: true, usage: { r1: { input: 40, output: 2, cache_read: 0, cache_write: 0, cost_usd: null, cost_source: null, cost_partial: false }, r2: { input: 50, output: 8, cache_read: 0, cache_write: 0, cost_usd: null, cost_source: null, cost_partial: false } } });
  const { unmount } = render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: config })} /></MemoryRouter>);
  expect(await screen.findByText('/c/t/item-bug-2')).toBeInTheDocument();
  expect(screen.getByText('correctness: approved · safety: changes')).toBeInTheDocument();
  expect(screen.getByText(/100 input \+ output tokens \(CLI-reported\)/)).toBeInTheDocument();
  expect(screen.getByText(/a\.txt \| 2 \+-/)).toBeInTheDocument();
  unmount();
  vi.mocked(api.workflow).mockResolvedValue({ config, run, active: true });
  render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: config })} /></MemoryRouter>);
  await screen.findByRole('region', { name: 'Fix login: Sign-off' });
  expect(screen.queryByText(/Item folder/)).not.toBeInTheDocument();
  expect(screen.queryByText(/approved ·/)).not.toBeInTheDocument();
});

it('names the agent that assembles the results, not a fixed role', async () => {
  const assembling: WorkflowRun = { ...run, tasks: [], assembly: { ...run.assembly, status: 'assigned' } };
  vi.mocked(api.workflow).mockResolvedValue({ config, run: assembling, active: true });
  const agents = ['dispatch', 'build'].map(id => draftAgent(id)).concat(draftAgent('frontend', { name: 'Editor' }));
  render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents, workflow: config })} /></MemoryRouter>);
  expect(await screen.findByText(/Assembly assigned to Editor/)).toBeInTheDocument();
});

it('shows an item board for pipeline workflows; a card opens that item\'s timeline', async () => {
  vi.mocked(api.workflow).mockResolvedValue({ config, run, active: true, usage: { a1: { input: 1200, output: 300, cache_read: 0, cache_write: 0, cost_usd: null, cost_source: null, cost_partial: false } } });
  const user = userEvent.setup();
  const { container } = render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: config })} /></MemoryRouter>);
  const board = await screen.findByRole('region', { name: 'Item board' });
  const card = within(board).getByRole('button', { name: /Fix login · Sign-off · waiting for a person/ });
  expect(card).toHaveTextContent('1,500 tokens');
  await user.click(card);
  expect((container.querySelector('#item-bug-1') as HTMLDetailsElement).open).toBe(true);
});

it('keeps the plain run view for workflows without pipeline features', async () => {
  const plain = { ...config, stages: [{ id: 'build', name: 'Build', agent: 'build', routes: { ready: null } }] };
  vi.mocked(api.workflow).mockResolvedValue({ config: plain, run: { ...run, config: plain, tasks: [] }, active: true, usage: {} });
  render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: plain })} /></MemoryRouter>);
  await screen.findByRole('heading', { name: /items accepted/ });
  expect(screen.queryByRole('region', { name: 'Item board' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Guard' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Decision log' })).not.toBeInTheDocument();
});

it('shows a failing guard and lets a person resume anyway', async () => {
  vi.mocked(api.workflow).mockResolvedValue({ config: { ...config, guard: { command: 'npm test', every_minutes: 15 } }, run: { ...run, guard: { passed: false, at_ms: 1, evidence: '$ npm test\nexit 1 · 900 ms\n2 failing', resumed_by_person: false } }, active: true });
  const user = userEvent.setup();
  render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: config })} /></MemoryRouter>);
  const notice = await screen.findByRole('region', { name: 'Guard' });
  expect(notice).toHaveTextContent('Paused: the guard failed');
  expect(notice).toHaveTextContent('2 failing');
  await user.click(within(notice).getByRole('button', { name: 'Resume anyway' }));
  expect(api.resumeGuard).toHaveBeenCalledWith('team', 7);
});

it('shows the decision log and lets a decision become a precedent when the log is on', async () => {
  vi.mocked(api.workflow).mockResolvedValue({ config, run, active: true });
  const user = userEvent.setup();
  render(<MemoryRouter><WorkflowRunView draft={teamDraft({ id: 'team', decision_log: true, agents: ['dispatch', 'build', 'frontend'].map(id => draftAgent(id)), workflow: config })} /></MemoryRouter>);
  const log = await screen.findByRole('region', { name: 'Decision log' });
  expect(await within(log).findByText('Prefer small fixes.')).toBeInTheDocument();
  await user.type(within(log).getByLabelText('New entry'), 'Never touch payments.');
  await user.click(within(log).getByRole('button', { name: 'Add to the log' }));
  expect(api.addDecision).toHaveBeenCalledWith('team', 'Never touch payments.');
  await user.click(within(log).getByRole('button', { name: 'Hide: Prefer small fixes.' }));
  expect(api.hideDecision).not.toHaveBeenCalled();
  await user.click(within(log).getByRole('button', { name: 'Confirm hiding: Prefer small fixes.' }));
  expect(api.hideDecision).toHaveBeenCalledWith('team', 'e1');
  const card = screen.getByRole('region', { name: 'Fix login: Sign-off' });
  await user.click(within(card).getByLabelText('Add this note to the decision log'));
  await user.type(within(card).getByLabelText('Note (optional)'), 'Small UI fixes ship.');
  await user.click(within(card).getByRole('button', { name: 'ship' }));
  expect(api.decideWorkflow).toHaveBeenLastCalledWith('team', { task: 'bug-1', outcome: 'ship', note: 'Small UI fixes ship.', start_seq: 7, log: true });
});

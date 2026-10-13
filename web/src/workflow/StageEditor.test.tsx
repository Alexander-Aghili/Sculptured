import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { api } from '../api';

vi.mock('../api', async orig => { const m = await orig<typeof import('../api')>(); return { ...m, api: { ...m.api, scheduleRuns: vi.fn().mockResolvedValue([{ schedule: 'schedule-1', at_ms: 1, outcome: 'skipped: busy' }]) } }; });
import { draftAgent, teamDraft } from '../test-fixtures';
import { StageEditor } from './StageEditor';
import { WorkflowSettings } from './WorkflowBoard';
import type { TeamDraft } from '../generated/TeamDraft';

const start = () => teamDraft({ agents: ['dispatch', 'build', 'alice', 'bob', 'frontend'].map((id) => draftAgent(id)), workflow: {
  input: '', dispatcher: 'dispatch', collector: 'frontend', entry: 'b', max_tasks: 4, max_steps: 12,
  stages: [{ id: 'b', name: 'Build', agent: 'build', routes: { ready: null } }],
} });
let latest: TeamDraft;
function Editor() {
  const [d, set] = useState(start());
  latest = d;
  return <><StageEditor draft={d} stageId="b" locked={false} change={(workflow) => set({ ...d, workflow })} onOpen={() => {}} />
    <WorkflowSettings draft={d} locked={false} change={(workflow) => set({ ...d, workflow })} editTeam={(fn) => set(fn(d))} expanded /></>;
}

it('keeps the stage editor as before until Advanced is opened', () => {
  render(<Editor />);
  expect(screen.getByLabelText('Responsible agent')).toBeInTheDocument();
  const advanced = within(screen.getByRole('region', { name: 'Stage Build' })).getByText('Advanced').closest('details')!;
  expect(advanced.open).toBe(false);
});

it('turns a stage into a check and sets a round limit', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.click(within(screen.getByRole('region', { name: 'Stage Build' })).getByText('Advanced'));
  await user.selectOptions(screen.getByLabelText('Stage type'), 'check');
  expect(latest.workflow!.stages[0]).toMatchObject({ kind: 'check', command: 'npm test', agent: '' });
  expect(screen.queryByLabelText('Responsible agent')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Command')).toHaveValue('npm test');
  await user.type(screen.getByLabelText('Most rounds per item'), '3');
  expect(latest.workflow!.stages[0].max_rounds).toBe(3);
});

it('gives each item its own copy from the settings\' Advanced section', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  const box = screen.getByLabelText('Give each item its own copy and branch');
  await user.click(box);
  expect(latest.workflow!.copies).toBe('per-item');
  await user.click(box);
  expect(latest.workflow!.copies).toBeUndefined();
});

it('keeps a review panel at two reviewers or more', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.click(within(screen.getByRole('region', { name: 'Stage Build' })).getByText('Advanced'));
  await user.selectOptions(screen.getByLabelText('Stage type'), 'panel');
  expect(latest.workflow!.stages[0].reviewers).toHaveLength(2);
  expect(screen.getByRole('checkbox', { name: 'Build' })).toBeDisabled();
});

it('hands items to a stronger agent after the rounds chosen under Advanced', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.click(within(screen.getByRole('region', { name: 'Stage Build' })).getByText('Advanced'));
  await user.type(screen.getByLabelText('Hand over after this many rounds'), '2');
  await user.selectOptions(screen.getByLabelText('Hand over to'), 'alice');
  expect(latest.workflow!.stages[0].escalate).toEqual({ after_rounds: 2, agent: 'alice' });
  await user.clear(screen.getByLabelText('Hand over after this many rounds'));
  expect(latest.workflow!.stages[0].escalate).toBeUndefined();
});

it('sets the guard, schedules and the decision log in the settings\' Advanced section', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.type(screen.getByLabelText('Guard command'), 'npm test');
  expect(latest.workflow!.guard).toEqual({ command: 'npm test', every_minutes: 15 });
  await user.clear(screen.getByLabelText('Guard command'));
  expect(latest.workflow!.guard).toBeUndefined();
  await user.click(screen.getByLabelText('Keep a decision log'));
  expect(latest.decision_log).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Add schedule' }));
  expect(latest.schedules).toEqual([{ id: 'schedule-1', agent: 'build', every_minutes: 30, message: '' }]);
  await user.type(screen.getByLabelText('Message for schedule-1'), 'Summarise');
  expect(latest.schedules![0].message).toBe('Summarise');
  await user.click(screen.getByRole('button', { name: 'Remove schedule-1' }));
  expect(latest.schedules).toBeUndefined();
});

it('keeps what is typed into the guard command, and sets its time limit', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.type(screen.getByLabelText('Guard command'), ' npm test');
  expect(latest.workflow!.guard!.command).toBe(' npm test');
  await user.type(screen.getByLabelText('Guard time limit in seconds'), '1200');
  expect(latest.workflow!.guard!.timeout_s).toBe(1200);
});

it('shows each schedule\'s recent runs', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await user.click(screen.getByRole('button', { name: 'Add schedule' }));
  expect(await screen.findByText(/skipped: busy/)).toBeInTheDocument();
  expect(api.scheduleRuns).toHaveBeenCalled();
});

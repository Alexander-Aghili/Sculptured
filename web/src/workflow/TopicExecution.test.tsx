import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi, beforeEach } from 'vitest';
import { TopicExecution } from './TopicExecution';
import { api } from '../api';
import type { WorkflowTask } from '../generated/WorkflowTask';
import type { WorkflowRun } from '../generated/WorkflowRun';

vi.mock('../api', () => ({ api: { topicExecution: vi.fn().mockResolvedValue({}) } }));
beforeEach(() => vi.clearAllMocks());
const topic = (id: string): WorkflowTask => ({ input: { id, title: id, context: 'source' }, stage: 'research', status: 'queued', assignment: null, history: [], problem: null });
function setup(task = topic('Geometry'), prerequisite = topic('Analysis')) {
  const run: WorkflowRun = { rig: 'book', start_seq: 42, batch_id: 'course', summary: '', tasks: [prerequisite, task], assembly: topic('assembly'), config: { input: '', dispatcher: 'dispatch', collector: 'frontend', entry: 'research', stages: [], max_tasks: 24, max_steps: 12 } };
  render(<TopicExecution task={task} run={run} active />);
}
it('selects prerequisites and saves dependent execution with the prior version', async () => {
  const user = userEvent.setup(); setup();
  expect(screen.getByRole('radio', { name: 'Independent' })).toBeChecked();
  await user.click(screen.getByRole('radio', { name: 'Dependent' }));
  expect(screen.getByRole('button', { name: 'Save topic execution' })).toBeDisabled();
  expect(screen.queryByRole('checkbox', { name: 'Geometry' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Analysis' }));
  await user.click(screen.getByRole('button', { name: 'Save topic execution' }));
  await waitFor(() => expect(api.topicExecution).toHaveBeenCalledWith('book', { task: 'Geometry', start_seq: 42, mode: 'dependent', depends_on: ['Analysis'], previous_mode: 'independent', previous_depends_on: [] }));
});
it('clears prerequisite ordering when switching to independent', async () => {
  const user = userEvent.setup(), task = topic('Geometry'); task.input.mode = 'dependent'; task.input.depends_on = ['Analysis'];
  setup(task);
  expect(screen.getByRole('status')).toHaveTextContent('Waiting for accepted results: Analysis');
  await user.click(screen.getByRole('radio', { name: 'Independent' }));
  await user.click(screen.getByRole('button', { name: 'Save topic execution' }));
  expect(api.topicExecution).toHaveBeenCalledWith('book', expect.objectContaining({ mode: 'independent', depends_on: [], previous_depends_on: ['Analysis'] }));
});
it('retains blocked prerequisites and prevents changing already assigned work', () => {
  const task = topic('Geometry'), prereq = topic('Analysis');
  task.input.mode = 'dependent'; task.input.depends_on = ['Analysis']; task.status = 'assigned'; task.assignment = 'existing'; prereq.status = 'blocked';
  setup(task, prereq);
  expect(screen.getByRole('status')).toHaveTextContent('Blocked prerequisites keep this topic waiting');
  expect(screen.getByRole('radio', { name: 'Independent' })).toBeDisabled();
  expect(screen.getByText(/only change before/)).toBeInTheDocument();
});

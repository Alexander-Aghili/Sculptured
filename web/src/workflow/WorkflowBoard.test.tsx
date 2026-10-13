import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { teamDraft, draftAgent } from '../test-fixtures';
import { WorkflowBoard } from './WorkflowBoard';
import type { TeamDraft } from '../generated/TeamDraft';
import { api } from '../api';

vi.mock('../api', async orig => { const m = await orig<typeof import('../api')>(); return { ...m, api: { ...m.api, workflow: vi.fn().mockResolvedValue({ run: null, active: false }) } }; });
function draft(): TeamDraft {
  return teamDraft({ agents: ['dispatch', 'build', 'review', 'frontend'].map(id => draftAgent(id)), connections: [], workflow: {
    input: '', dispatcher: 'dispatch', collector: 'frontend', entry: 'build', max_tasks: 24, max_steps: 12,
    stages: [{ id: 'build', name: 'Build interaction', agent: 'build', routes: { ready: 'review' } }, { id: 'review', name: 'Review interaction', agent: 'review', routes: { revise: 'build', accept: null } }],
  } });
}
function Editor({ locked = false, open = vi.fn() }: { locked?: boolean; open?: (id: string) => void }) {
  const [d, set] = useState(draft());
  return <MemoryRouter><WorkflowBoard draft={d} edit={set} locked={locked} onOpen={open} /><output data-testid="draft">{JSON.stringify(d)}</output></MemoryRouter>;
}

it('saves unstructured input and exposes the dispatcher and join barrier', async () => {
  const user = userEvent.setup(); render(<Editor />);
  const input = screen.getByLabelText('Workflow input');
  await user.click(input); await user.paste('https://example.test/notes\nIdeas: show counterexamples');
  expect(JSON.parse(screen.getByTestId('draft').textContent!).workflow.input).toBe('https://example.test/notes\nIdeas: show counterexamples');
  expect(screen.getByText('Dynamically dispatches N interactions')).toBeInTheDocument();
  expect(screen.getByText(/All N items accepted/)).toBeInTheDocument();
  expect(api.workflow).toHaveBeenCalled();
});

it('lets a reviewer route revisions back to the builder and inspect agent instructions', async () => {
  const user = userEvent.setup(), open = vi.fn(); render(<Editor open={open} />);
  await user.click(screen.getByRole('button', { name: /Reusable stage Review interaction/ }));
  expect(screen.getByLabelText('Destination for revise')).toHaveValue('build');
  await user.selectOptions(screen.getByLabelText('Destination for accept'), 'build');
  expect(JSON.parse(screen.getByTestId('draft').textContent!).workflow.stages[1].routes.accept).toBe('build');
  await user.click(screen.getByRole('button', { name: 'Open agent instructions' })); expect(open).toHaveBeenCalledWith('review');
});

it('locks input and stage configuration while running', async () => {
  render(<Editor locked />);
  expect(screen.getByLabelText('Workflow input')).toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: /Entry stage Build interaction/ }));
  expect(screen.getByLabelText('Responsible agent')).toBeDisabled();
  expect(within(screen.getByRole('region', { name: 'Stage Build interaction' })).getByRole('button', { name: 'Remove stage' })).toBeDisabled();
});

it('creates a separate worker with the same role and includes it in stage capacity', async () => {
  const user = userEvent.setup(); render(<Editor />);
  await user.click(screen.getByRole('button', { name: /Entry stage Build interaction/ }));
  await user.click(screen.getByRole('button', { name: 'Create parallel worker' }));
  const d: TeamDraft = JSON.parse(screen.getByTestId('draft').textContent!);
  const id = d.workflow!.stages[0].workers![0], original = d.agents.find(a => a.id === 'build')!;
  expect(id).not.toBe('build');
  expect(d.agents.find(a => a.id === id)).toMatchObject({ job: original.job, kind: original.kind, group_id: original.group_id });
  expect(screen.getByRole('group', { name: /Parallel topic workers · 2/ })).toBeInTheDocument();
});

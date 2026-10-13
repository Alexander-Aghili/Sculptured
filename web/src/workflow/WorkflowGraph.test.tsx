import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { draftAgent, teamDraft } from '../test-fixtures';
import { WorkflowGraph, stageBoxes, stageNode, workflowLinks } from './WorkflowGraph';
import type { Workflow } from '../generated/Workflow';

const workflow: Workflow = { input: '', dispatcher: 'dispatch', collector: 'frontend', entry: 'build', max_tasks: 4, max_steps: 12, stages: [
  { id: 'build', name: 'Build', agent: 'build', routes: { ready: 'tests' } },
  { id: 'tests', name: 'Tests', agent: '', kind: 'check', command: 'npm test', routes: { passed: 'review', failed: 'build' } },
  { id: 'review', name: 'Review', agent: '', reviewers: ['alice', 'bob'], routes: { approved: 'chief', changes: 'build' } },
  { id: 'chief', name: 'Sign-off', agent: '', kind: 'human', prompt: 'Ship it?', routes: { ship: null, rework: 'build' } },
] };
const agents = ['dispatch', 'build', 'alice', 'bob', 'frontend'].map((id, i) => draftAgent(id, { x: 40 + i * 260, y: 40 }));
const draft = (over = {}) => teamDraft({ agents, workflow, ...over });

it('gives every stage without a single agent its own box, and routes arrows through it', () => {
  expect(stageNode(workflow.stages[0])).toBe('build');
  expect(Object.keys(stageBoxes(draft()))).toEqual(['$stage:tests', '$stage:review', '$stage:chief']);
  const links = workflowLinks(draft());
  expect(links.find((l) => l.id === 'build:ready')).toMatchObject({ from: 'build', to: '$stage:tests' });
  expect(links.find((l) => l.id === 'tests:passed')).toMatchObject({ from: '$stage:tests', to: '$stage:review' });
  expect(links.filter((l) => l.from === '$stage:review' && l.pool).map((l) => l.to)).toEqual(['alice', 'bob']);
});

it('draws the boxes as buttons that open their stage', () => {
  const open = vi.fn();
  render(<div style={{ width: 2000, height: 1000 }}><WorkflowGraph draft={draft()} onOpen={open} onReveal={() => {}} /></div>);
  fireEvent.click(screen.getByRole('button', { name: /^Check: Tests/ }));
  expect(open).toHaveBeenCalledWith({ stage: 'tests' });
  expect(screen.getByRole('button', { name: /^Person decides: Sign-off/ })).toHaveTextContent('Ship it?');
  expect(screen.getByRole('button', { name: /^Review panel: Review/ })).toHaveTextContent('all approve');
  expect(screen.getByRole('button', { name: 'Workflow route: passed' })).toBeInTheDocument();
});

it('keeps stage boxes and their routes when the agents are in a collapsed group', () => {
  const grouped = draft({ groups: [{ id: 'g', label: 'Team', x: 0, y: 0, w: 1400, h: 300 }], agents: agents.map((a) => ({ ...a, group_id: 'g' })) });
  render(<div><WorkflowGraph draft={grouped} collapsed={new Set(['g'])} onOpen={() => {}} onReveal={() => {}} /></div>);
  expect(screen.getByRole('button', { name: /^Check: Tests/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Workflow route: passed' })).toBeInTheDocument();
});

it('draws no stage boxes for a plain workflow', () => {
  const plain = { ...workflow, stages: [{ id: 'build', name: 'Build', agent: 'build', routes: { ready: null } }] };
  const { container } = render(<div><WorkflowGraph draft={draft({ workflow: plain })} onOpen={() => {}} onReveal={() => {}} /></div>);
  expect(container.querySelector('.workflow-stage-node')).toBeNull();
});

it('draws a round-limit route as a dashed arrow labelled with its rounds', () => {
  const limited = { ...workflow, stages: workflow.stages.map((s) => s.id === 'build' ? { ...s, max_rounds: 2, on_limit: 'chief' } : s) };
  expect(workflowLinks(draft({ workflow: limited })).find((l) => l.id === 'build:on_limit')).toMatchObject({ from: 'build', to: '$stage:chief', label: 'after 2 rounds', pool: true });
});

it('puts a stage box where it was dragged to', () => {
  const placed = { ...workflow, stages: workflow.stages.map((s) => s.id === 'tests' ? { ...s, position: { x: 900, y: 600 } } : s) };
  expect(stageBoxes(draft({ workflow: placed }))['$stage:tests']).toMatchObject({ x: 900, y: 600 });
});

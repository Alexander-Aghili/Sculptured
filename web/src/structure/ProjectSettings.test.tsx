import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { teamDraft } from '../test-fixtures';
import type { TeamDraft } from '../generated/TeamDraft';
import { ProjectFolder } from './ProjectFolder';
import { RenameProject } from './RenameProject';
import { AgentPanel, type Edit } from './Panels';
import { effectiveFolder } from '../draft/folders';

vi.mock('./FolderPicker', () => ({
  useHome: () => '/home/me', shortPath: (p: string) => p,
  FolderPicker: ({ onChoose }: { onChoose: (p: string) => void }) => <button onClick={() => onChoose('/home/me/project')}>Pick test folder</button>,
}));
function Settings({ locked = false, override = false }: { locked?: boolean; override?: boolean }) {
  const [draft, setDraft] = useState<TeamDraft>(() => {
    const d = teamDraft();
    if (override) { d.folder = '/home/me/project'; d.agents[0].folder = '/home/me/own'; }
    return d;
  });
  const edit: Edit = fn => { setDraft(d => { const r = fn(d); return 'agents' in r ? r : r.draft; }); return null; };
  return <><RenameProject draft={draft} edit={edit} /><ProjectFolder draft={draft} edit={edit} locked={locked} />
    <AgentPanel draft={draft} agentId={draft.agents[0].id} edit={edit} locked={locked} issues={[]} onSelect={() => {}} />
    <output aria-label="Saved project">{draft.id}|{draft.name}|{effectiveFolder(draft, draft.agents[0])}</output></>;
}
it('renames without changing identity and gives existing agents the project folder', () => {
  render(<Settings />);
  fireEvent.click(screen.getByRole('button', { name: 'Rename project' }));
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Renamed project' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByLabelText('Saved project')).toHaveTextContent('t|Renamed project|');
  fireEvent.click(screen.getByRole('button', { name: 'Choose project folder…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pick test folder' }));
  expect(screen.getByLabelText('Saved project')).toHaveTextContent('t|Renamed project|/home/me/project');
  expect(screen.getByText(/from project/)).toBeInTheDocument();
});
it('allows renaming a running project but explains the folder lock', () => {
  render(<Settings locked />);
  expect(screen.getByRole('button', { name: 'Rename project' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Choose project folder…' })).toBeDisabled();
  expect(screen.getByText('Stop the team to change its folder.')).toBeInTheDocument();
});
it('can switch existing overrides to the project folder in one action', () => {
  render(<Settings override />);
  expect(screen.getByLabelText('Saved project')).toHaveTextContent('/home/me/own');
  fireEvent.click(screen.getByRole('button', { name: 'Use project folder for all agents' }));
  expect(screen.getByLabelText('Saved project')).toHaveTextContent('/home/me/project');
  expect(screen.queryByRole('button', { name: 'Use project folder for all agents' })).not.toBeInTheDocument();
});

it('uses one agent\'s folder for every agent in one action', () => {
  render(<Settings override />);
  fireEvent.click(screen.getByRole('button', { name: 'Use this folder for every agent' }));
  expect(screen.getByLabelText('Project folder')).toHaveTextContent('/home/me/own');
  expect(screen.queryByText(/use their own folders/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Saved project')).toHaveTextContent('/home/me/own');
});

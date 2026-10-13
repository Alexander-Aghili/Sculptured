import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import type { TeamDraft } from '../generated/TeamDraft';
import { forgetViewports } from '../shell/viewport';
import { teamRecord } from '../test-fixtures';
import { saveTiming } from '../useTeamDraft';
import { card, fakeTeam, renderAt, resetApi } from './harness';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  const names = ['getTeam', 'saveTeam', 'listTeams', 'templates', 'createTeam', 'startTeam', 'stopTeam', 'importTeam', 'listFolders', 'createFolder', 'listRigs', 'latestSeatEvents', 'stopRig'];
  return { ...m, api: { ...m.api, ...Object.fromEntries(names.map((n) => [n, vi.fn()])) } };
});

const saved = (): TeamDraft => vi.mocked(api.saveTeam).mock.calls.at(-1)![2];
const kindOf = (id: string) => saved().agents.find((a) => a.id === id)!.kind;

async function board() {
  fakeTeam(teamRecord());
  renderAt('/team/t/structure');
  await screen.findByRole('region', { name: 'Structure board' });
  return userEvent.setup();
}

beforeEach(() => {
  resetApi();
  forgetViewports();
  localStorage.clear();
  // These scenarios exercise the explicitly opened panel.
  localStorage.setItem('sculptured.panels.v2.right', 'true');
  saveTiming.delayMs = 5;
});

describe('Agent details', () => {
  it('a click opens a details page where the agent switches to Codex; Esc closes it', async () => {
    const user = await board();
    await user.click(card('Builder'));
    const sheet = screen.getByRole('dialog', { name: 'Builder details' });
    await user.click(within(sheet).getByRole('radio', { name: /Codex/ }));
    await waitFor(() => expect(kindOf('builder')).toBe('codex'));
    expect(within(sheet).getByRole('combobox', { name: 'Codex model for Builder' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('picks a model for one agent', async () => {
    const user = await board();
    await user.click(card('Builder'));
    await user.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /Claude/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Claude model for Builder' }), 'opus');
    await waitFor(() => expect(saved().agents.find((a) => a.id === 'builder')!.advanced.model).toBe('opus'));
    expect(card('Builder')).toHaveTextContent('Opus');
  });

  it('right-click offers Runs on Codex', async () => {
    const user = await board();
    fireEvent.contextMenu(card('Reviewer'), { clientX: 200, clientY: 200 });
    const menu = screen.getByRole('menu', { name: 'Reviewer actions' });
    await user.click(within(menu).getByRole('menuitemradio', { name: /Runs on Codex/ }));
    await waitFor(() => expect(kindOf('reviewer')).toBe('codex'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Team models', () => {
  it('switches every agent at once and sets the team Claude model, shown on the cards', async () => {
    const user = await board();
    const team = screen.getByRole('region', { name: 'Team' });
    await user.click(within(team).getByRole('radio', { name: /Claude/ }));
    await waitFor(() => expect(saved().agents.every((a) => a.kind === 'claude')).toBe(true));
    await user.selectOptions(within(team).getByRole('combobox', { name: 'Team: Claude model' }), 'sonnet');
    await waitFor(() => expect(saved().models?.claude).toBe('sonnet'));
    expect(card('Reviewer')).toHaveTextContent('Sonnet');
  });
});

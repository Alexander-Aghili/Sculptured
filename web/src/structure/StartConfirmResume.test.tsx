import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api';
import { StartConfirm } from './StartConfirm';

afterEach(() => vi.restoreAllMocks());
const c = { title: 'Start 2 Claude agents?', body: 'They run in ~/work.', efficiency: [], team: 't' };

describe('fresh or resume at Start', () => {
  it('offers Resume when agents have a last conversation, and says what it costs', async () => {
    vi.spyOn(api, 'resumable').mockResolvedValue({ agents: [{ seat: 'team.a@t', name: 'Lead' }, { seat: 'team.b@t', name: 'Builder' }] });
    const onConfirm = vi.fn();
    render(<StartConfirm c={c} onConfirm={onConfirm} onCancel={() => {}} />);
    const user = userEvent.setup();
    expect(await screen.findByRole('radio', { name: /Start fresh/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Resume.*2 agents \(Lead and Builder\)/ }));
    expect(screen.getByText(/re-reads it on every step/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start team' }));
    expect(onConfirm).toHaveBeenCalledWith({ resume: true });
  });

  it('shows no choice when nothing can be resumed, and starts fresh', async () => {
    vi.spyOn(api, 'resumable').mockResolvedValue({ agents: [] });
    const onConfirm = vi.fn();
    render(<StartConfirm c={c} onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start team' }));
    expect(screen.queryByRole('radio')).toBeNull();
    expect(onConfirm).toHaveBeenCalledWith({ resume: false });
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { HostedSession } from './session';

let session: HostedSession = { kind: 'signed-out' };
vi.mock('./HostedGate', () => ({ useHosted: () => session }));
const { OpsPage } = await import('./OpsPage');
afterEach(() => vi.restoreAllMocks());

function at(url: string) {
  const assign = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign, search: url.slice(url.indexOf('?')) } as Location);
  render(<MemoryRouter initialEntries={[url]}><OpsPage /></MemoryRouter>);
  return assign;
}

it('sends an admin straight on to the ops tools, to the page they asked for', () => {
  session = { kind: 'signed-in', user: { id: 'u', name: 'Op', email: 'op@x.com', role: 'admin' }, csrf: 'c' };
  const assign = at('/ops?next=%2Flogs%2F');
  expect(assign).toHaveBeenCalledWith('/gw/api/admin/ops-ticket?next=%2Flogs%2F');
});

it('tells someone who is not an admin which account they are using, and lets them switch', async () => {
  session = { kind: 'signed-in', user: { id: 'u', name: 'Test User', email: 'test@user.com', role: 'member' }, csrf: 'c' };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  const assign = at('/ops?next=%2F');
  expect(screen.getByRole('heading', { name: 'Ops tools are for admins' })).toBeInTheDocument();
  expect(screen.getByText(/test@user\.com/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sign in as an admin' }));
  await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  expect(sessionStorage.getItem('sculptured.after-login')).toBe('/ops?next=%2F');
});

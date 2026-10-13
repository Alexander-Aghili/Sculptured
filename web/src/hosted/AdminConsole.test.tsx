import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';

afterEach(() => vi.restoreAllMocks());
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const ana = { id: 'u-ana', name: 'Ana', email: 'ana@x.com', role: 'member', created_at: '2026-10-01T00:00:00Z', disabled_at: null, last_seen: null, providers: ['google'] };

/** A fake gateway that records every write. */
function gateway(extra: Record<string, unknown> = {}) {
  const writes: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    const path = String(url).replace(/^.*\/gw\/api/, '');
    const method = init?.method ?? 'GET';
    if (method === 'POST') { writes.push(`${path} ${init?.body ?? ''}`.trim()); return reply(200, { ok: true }); }
    if (path in extra) return reply(200, extra[path]);
    if (path === '/admin/users') return reply(200, [ana]);
    return reply(200, []);
  });
  render(<MemoryRouter><AdminPage csrf={'c'.repeat(64)} /></MemoryRouter>);
  return writes;
}

it('makes a member an admin and signs them out everywhere', async () => {
  const writes = gateway();
  const row = (await screen.findByText('ana@x.com')).closest('tr')!;
  await userEvent.click(within(row).getByRole('button', { name: 'Make admin' }));
  await userEvent.click(within(row).getByRole('button', { name: 'Sign out everywhere' }));
  expect(writes).toEqual(['/admin/users/u-ana/role {"admin":true}', '/admin/users/u-ana/sign-out']);
});

it("lists a user's computers and revokes one", async () => {
  const writes = gateway({ '/admin/users/u-ana/devices': [{ id: 'd1', name: 'laptop', platform: 'linux-x64', created_at: '2026-10-02T00:00:00Z', last_seen: null, connected: true }] });
  const row = (await screen.findByText('ana@x.com')).closest('tr')!;
  await userEvent.click(within(row).getByRole('button', { name: 'Computers' }));
  const list = await screen.findByRole('list', { name: "Ana's computers" });
  expect(within(list).getByText(/laptop/)).toHaveTextContent('laptop · linux-x64 · connected now');
  await userEvent.click(within(list).getByRole('button', { name: 'Revoke laptop' }));
  expect(writes).toEqual(['/admin/users/u-ana/devices/d1/revoke']);
});

it('stops a running instance only after a second, explicit confirmation', async () => {
  const writes = gateway({ '/admin/instances': [{ user: 'u-ana', name: 'Ana', email: 'ana@x.com', idle_seconds: 125, computer_connected: true }] });
  await userEvent.click(await screen.findByRole('tab', { name: 'Running now' }));
  const row = (await screen.findByText(/ana@x\.com/)).closest('tr')!;
  expect(row).toHaveTextContent('2 min');
  expect(row).toHaveTextContent('computer connected');
  await userEvent.click(within(row).getByRole('button', { name: 'Stop' }));
  expect(writes).toEqual([]);
  expect(within(row).getByText(/agents on their computer keep running/)).toBeInTheDocument();
  await userEvent.click(within(row).getByRole('button', { name: 'Stop Ana now' }));
  expect(writes).toEqual(['/admin/instances/u-ana/stop']);
});

it('shows the audit log in plain words, newest first', async () => {
  gateway({ '/admin/audit': [
    { id: 2, at: '2026-10-12T10:00:00Z', action: 'user.signed_out', detail: {}, admin_email: 'op@x.com', target_email: 'ana@x.com' },
    { id: 1, at: '2026-10-12T09:00:00Z', action: 'ops.signed_in', detail: {}, admin_email: 'op@x.com', target_email: null },
  ] });
  await userEvent.click(await screen.findByRole('tab', { name: 'Audit log' }));
  const rows = within(await screen.findByRole('table', { name: 'Admin actions' })).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('op@x.com');
  expect(rows[0]).toHaveTextContent('signed ana@x.com out everywhere');
  expect(rows[1]).toHaveTextContent('opened the ops tools');
});

it('links to the ops tools through a one-time sign-in', async () => {
  gateway();
  const link = await screen.findByRole('link', { name: /Ops tools/ });
  expect(link).toHaveAttribute('href', '/gw/api/admin/ops-ticket?next=%2F');
});

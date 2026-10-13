import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { HostedSession } from '../hosted/session';

let session: HostedSession = { kind: 'local' };
vi.mock('../hosted/HostedGate', () => ({ useHosted: () => session }));
const { SidebarAccount } = await import('./Sidebar');
afterEach(() => { session = { kind: 'local' }; });

it('links to your account by name; signing out lives on the account page', () => {
  session = { kind: 'signed-in', user: { id: 'u', name: 'Ana Lee', email: 'ana@x.com', role: 'admin' }, csrf: 'c' };
  render(<MemoryRouter><SidebarAccount /></MemoryRouter>);
  const you = screen.getByRole('link', { name: /Ana Lee/ });
  expect(you).toHaveAttribute('href', '/account');
  expect(you).toHaveTextContent('AL');
  expect(you).toHaveTextContent('ana@x.com');
  expect(screen.getByRole('link', { name: 'Computers' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
});

it('on your own computer it links to your usage', () => {
  render(<MemoryRouter><SidebarAccount /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Account and usage' })).toHaveAttribute('href', '/account');
  expect(screen.queryByRole('link', { name: 'Computers' })).toBeNull();
});

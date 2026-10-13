import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { HostedSession } from './session';

let session: HostedSession = { kind: 'signed-out' };
vi.mock('./session', async (orig) => ({ ...(await orig<typeof import('./session')>()), loadSession: () => Promise.resolve(session) }));
vi.mock('./analytics', () => ({ startAnalytics: () => undefined, routeTemplate: (p: string) => p }));
const { HostedGate } = await import('./HostedGate');
afterEach(() => sessionStorage.clear());

const app = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <HostedGate>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/ops" element={<p>ops page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </HostedGate>
  </MemoryRouter>,
);

it('after signing in, brings you back to the page that asked you to sign in', async () => {
  session = { kind: 'signed-out' };
  const first = app('/ops?next=%2Flogs%2F');
  expect(await screen.findByText('login page')).toBeInTheDocument();
  first.unmount();
  session = { kind: 'signed-in', user: { id: 'u', name: 'Op', email: 'op@x.com', role: 'admin' }, csrf: 'c' };
  app('/');
  expect(await screen.findByText('ops page')).toBeInTheDocument();
  expect(sessionStorage.getItem('sculptured.after-login')).toBeNull();
});

it('never follows a stored address off this site', async () => {
  sessionStorage.setItem('sculptured.after-login', '//evil.example/');
  session = { kind: 'signed-in', user: { id: 'u', name: 'Op', email: 'op@x.com', role: 'admin' }, csrf: 'c' };
  app('/');
  expect(await screen.findByText('home')).toBeInTheDocument();
});

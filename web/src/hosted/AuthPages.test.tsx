import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { JoinPage } from './JoinPage';

afterEach(() => vi.restoreAllMocks());
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

it('the sign-in page offers the official Google and GitHub buttons, then email and password', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, { password: true, google: true, github: true }));
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Sign in to Sculptured' })).toBeInTheDocument();
  const google = await screen.findByRole('link', { name: 'Continue with Google' });
  expect(google).toHaveAttribute('href', '/gw/api/login/oidc/google');
  expect(google).toHaveClass('gsi-button');
  expect(google.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  const github = screen.getByRole('link', { name: 'Continue with GitHub' });
  expect(github).toHaveClass('github-button');
  expect(github.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  expect(screen.getByText('or')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Everything we record' })).toHaveAttribute('href', '/what-we-record');
});

it('the sign-in page hides providers that are not configured', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, { password: true, google: false, github: false }));
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await screen.findByLabelText('Email');
  expect(screen.queryByRole('link', { name: /Continue with/ })).toBeNull();
  expect(screen.queryByText('or')).toBeNull();
});

it('the logo goes to the app, not to a site that does not exist', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, { password: true, google: false, github: false }));
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Sculptured' })).toHaveAttribute('href', '/');
});

it('a used invite says so and links to sign in', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => String(url).includes('/invite/')
    ? reply(410, { error: { code: 'invite_used', message: 'This invite has already been used. Sign in instead.' } })
    : reply(200, { password: true, google: false, github: false }));
  render(<MemoryRouter initialEntries={['/join/tok']}><Routes><Route path="/join/:token" element={<JoinPage />} /></Routes></MemoryRouter>);
  expect(await screen.findByText(/already been used/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});

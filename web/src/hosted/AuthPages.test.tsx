import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const DMG = 'https://example.com/Sculptured-mac.dmg';
function asBrowser(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}
function gateway(macApp: string | null) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
    String(url).endsWith('/gw/api/releases') ? reply(200, { targets: ['aarch64-apple-darwin'], mac_app: macApp }) : reply(200, { password: true, google: true, github: true }));
}

it('on a Mac, the sign-in page offers the app first, and remembers choosing the browser', async () => {
  localStorage.clear();
  asBrowser(SAFARI_MAC);
  gateway(DMG);
  const { unmount } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'Download Sculptured for Mac' })).toHaveAttribute('href', DMG);
  expect(screen.getByText(/Open Anyway/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Email')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Continue in the browser' }));
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
  unmount();
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Download Sculptured for Mac' })).toBeNull();
});

it('inside the Mac app, and when there is no app, the sign-in page is as usual', async () => {
  localStorage.clear();
  asBrowser(`${SAFARI_MAC} Sculptured/0.1.0 Electron/44.5.1`);
  gateway(DMG);
  const { unmount } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  unmount();
  vi.restoreAllMocks();
  asBrowser(SAFARI_MAC);
  gateway(null);
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(await screen.findByLabelText('Email')).toBeInTheDocument();
});

it('knows a Mac browser from the app and from an iPad', async () => {
  const { isMacBrowser } = await import('./MacAppPrompt');
  expect(isMacBrowser(SAFARI_MAC, 0)).toBe(true);
  expect(isMacBrowser(`${SAFARI_MAC} Electron/44.5.1`, 0)).toBe(false);
  expect(isMacBrowser(SAFARI_MAC, 5)).toBe(false);
  expect(isMacBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe(false);
});

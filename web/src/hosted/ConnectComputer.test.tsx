import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectComputer, detectOs } from './ConnectComputer';

afterEach(() => vi.restoreAllMocks());
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const KEY = 'k'.repeat(64);

function gateway(targets = ['x86_64-pc-windows-gnu', 'x86_64-unknown-linux-gnu'], macApp: string | null = null) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    if (String(url).endsWith('/gw/api/releases')) return reply({ targets, mac_app: macApp });
    if (String(url).endsWith('/gw/api/device/connect-key')) return reply({ key: KEY, expires_in: 1800 });
    return reply({}, 404);
  });
  return calls;
}

it('knows the system from the browser', () => {
  expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
  expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe('mac');
  expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
});

it('copies a one-time connect command for this system in one click', async () => {
  const calls = gateway();
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true });
  render(<ConnectComputer os="linux" />);
  expect(await screen.findByRole('tab', { name: 'Linux', selected: true })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Copy connect command' }));
  const cmd = `curl -fsSL ${window.location.origin}/install.sh | sh -s -- --key ${KEY}`;
  expect(copy).toHaveBeenCalledWith(cmd);
  expect(calls).toContain('POST /gw/api/device/connect-key');
  expect(await screen.findByText(/Copied/)).toHaveTextContent('paste it');
  expect(screen.getByText(cmd)).toBeInTheDocument();
  expect(screen.getByText(/works once, for 30 minutes/)).toBeInTheDocument();
});

it('gives Windows its PowerShell command', async () => {
  gateway();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  render(<ConnectComputer os="windows" />);
  const panel = await screen.findByRole('tabpanel');
  expect(within(panel).getByText(/PowerShell/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Copy connect command' }));
  expect(screen.getByText(`$env:SCULPTURED_KEY="${KEY}"; irm ${window.location.origin}/install.ps1 | iex`)).toBeInTheDocument();
});

it('says plainly when there is no build for a system yet', async () => {
  gateway();
  render(<ConnectComputer os="mac" />);
  expect(await screen.findByText(/no Sculptured build for macOS yet/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copy connect command' })).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: 'Linux' }));
  expect(screen.getByRole('button', { name: 'Copy connect command' })).toBeInTheDocument();
});

it('still shows the command when the browser will not copy', async () => {
  gateway();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
  render(<ConnectComputer os="linux" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Copy connect command' }));
  expect(await screen.findByText(/Select it and copy it/)).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`--key ${KEY}`))).toBeInTheDocument();
});

it('offers Macs the app to download, and the Terminal command too', async () => {
  const dmg = 'https://example.com/Sculptured-mac-arm64.dmg';
  gateway(['aarch64-apple-darwin', 'x86_64-unknown-linux-gnu'], dmg);
  render(<ConnectComputer os="mac" />);
  const link = await screen.findByRole('link', { name: 'Download Sculptured for Mac' });
  expect(link).toHaveAttribute('href', dmg);
  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByText(/Open Anyway/)).toBeInTheDocument();
  expect(within(panel).getByText(/Sculptured account/)).toBeInTheDocument();
  expect(within(panel).getByRole('button', { name: 'Copy connect command' })).toBeInTheDocument();
});

it('offers Macs only the Terminal command when there is no app', async () => {
  gateway(['aarch64-apple-darwin']);
  render(<ConnectComputer os="mac" />);
  expect(await screen.findByRole('button', { name: 'Copy connect command' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Download Sculptured for Mac' })).toBeNull();
});

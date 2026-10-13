import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { existsSync, readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdminAnalytics } from './AdminAnalytics';
import { RECORDED_EVENTS } from './analytics';
import { gw } from './session';
import { WhatWeRecord } from './WhatWeRecord';

vi.mock('./session', async (orig) => ({ ...(await orig<typeof import('./session')>()), gw: vi.fn() }));

const data: Record<string, unknown> = {
  '/admin/analytics/overview?days=30': {
    days: [
      { day: '2026-10-10', active_users: 1, seconds_total: 600, seconds_median: 600 },
      { day: '2026-10-11', active_users: 3, seconds_total: 2700, seconds_median: 900 },
      { day: '2026-10-12', active_users: 2, seconds_total: 1200, seconds_median: 600 },
    ],
    active_week: 3,
    funnel: { invited: 10, joined: 8, computer: 6, first_team: 4, first_run: 2, week2: 1 },
  },
  '/admin/analytics/users': [
    { id: 'u1', name: 'Ana', email: 'ana@x.com', joined: '2026-10-01T00:00:00Z', last_active: '2026-10-12T10:00:00Z', seconds_week: 3600, teams: 2, runs: 3, tokens: 12000, devices: 1 },
  ],
  '/admin/analytics/users/u1/timeline': [
    { id: 9, at: '2026-10-12T10:00:00Z', source: 'sculptured', name: 'team.started', props: { agents: 2 } },
    { id: 8, at: '2026-10-12T09:00:00Z', source: 'browser', name: 'ui.action', props: { name: 'describe-it' } },
  ],
  '/admin/analytics/features?days=30': [{ name: 'describe-it', events: 5, users: 2, share: 0.5 }],
  '/admin/analytics/setups?days=30': {
    agents: [{ n: 2, teams: 3 }, { n: 4, teams: 1 }],
    runtimes: [{ runtime: 'claude-code', teams: 4 }],
    models: [{ n: 1, teams: 3 }, { n: 2, teams: 1 }],
    uses: { arrows: 3, checks: 1, copies: 2, token_limits: 0, workflow: 0, of: 4 },
  },
  '/admin/analytics/errors?days=30': [{ day: '2026-10-12', api_5xx: 2, failed_checks: 1, failed_starts: 3 }],
};

beforeEach(() => {
  vi.mocked(gw).mockReset().mockImplementation(async (_m: string, path: string) => {
    if (!(path in data)) throw new Error(`unexpected ${path}`);
    return data[path] as never;
  });
});

it('shows daily activity as a chart with its table, and the funnel with percentages', async () => {
  render(<AdminAnalytics />);
  const active = await screen.findByRole('figure', { name: 'Active users per day' });
  expect(within(active).getAllByRole('img').length).toBeGreaterThan(0);
  const table = within(active).getByRole('table');
  expect(within(table).getByText('2026-10-11')).toBeInTheDocument();
  expect(within(table).getByText('3')).toBeInTheDocument();
  const funnel = screen.getByRole('list', { name: 'From invite to returning' });
  expect(funnel).toHaveTextContent('Joined8 · 80% of invited');
  expect(funnel).toHaveTextContent('Ran a team2 · 25% of joined');
  const fills = [...funnel.querySelectorAll<HTMLElement>('.an-fill')].map((f) => f.style.width);
  expect(fills[1]).toBe('80%');
  expect(fills[4]).toBe('25%');
});

it('opens a person’s timeline from the people table', async () => {
  render(<AdminAnalytics />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'People' }));
  await user.click(await screen.findByRole('button', { name: 'Ana' }));
  const timeline = await screen.findByRole('list', { name: 'Ana’s timeline' });
  expect(timeline).toHaveTextContent('team.started');
  expect(timeline).toHaveTextContent('agents: 2');
});

it('shows feature use and setups as shares', async () => {
  render(<AdminAnalytics />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Features' }));
  expect(await screen.findByRole('list', { name: 'Feature use' })).toHaveTextContent('describe-it2 people · 50%');
  await user.click(screen.getByRole('tab', { name: 'Setups' }));
  expect(await screen.findByRole('list', { name: 'What teams use' })).toHaveTextContent('Checks1 of 4 · 25%');
  expect(screen.getByRole('list', { name: 'Models per started team' })).toHaveTextContent('2 models chosen1 start');
  await user.click(screen.getByRole('tab', { name: 'Errors' }));
  expect(await screen.findByRole('figure', { name: 'Failed starts per day' })).toBeInTheDocument();
});

it('What we record lists every recorded event', () => {
  render(<MemoryRouter><WhatWeRecord /></MemoryRouter>);
  const table = screen.getByRole('table', { name: 'Everything recorded' });
  for (const e of RECORDED_EVENTS) expect(table).toHaveTextContent(e.name);
});

// The gateway lives in the private sculptured-cloud repo; with it checked out beside this one, the
// list must match the events the gateway allows exactly.
const gatewayAnalytics = `${process.cwd()}/../../sculptured-cloud/src/analytics.rs`;
it.skipIf(!existsSync(gatewayAnalytics))('the recorded events match the gateway allowlist', () => {
  const rust = readFileSync(gatewayAnalytics, 'utf8');
  const allowed = new Set([...rust.matchAll(/\(\w+, "([a-z0-9.]+)"(?: \| "([a-z0-9.]+)")*\)/g)].flatMap((m) => m[0].match(/"[a-z0-9.]+"/g)!.map((x) => x.slice(1, -1))));
  expect(new Set(RECORDED_EVENTS.map((e) => e.name))).toEqual(allowed);
});

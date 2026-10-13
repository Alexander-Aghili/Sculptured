import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SignInNeeded } from './SignInNeeded';
import type { AgentRow } from './model';
import type { EventRecord } from '../generated/EventRecord';

afterEach(() => vi.restoreAllMocks());
const agent = { name: 'Planner', seat: { runtime: 'claude-code', host: 'pc-1' } } as unknown as AgentRow;
const said = (text: string) => ({ seq: 1, body: { type: 'agent-text', text } }) as unknown as EventRecord;

it('offers to sign Claude Code in on the agent\'s computer when it says it is not logged in', async () => {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    return Promise.resolve(new Response(JSON.stringify({ url: 'https://claude.ai/oauth?x=1', output: '' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  vi.spyOn(window, 'open').mockReturnValue(null);
  render(<SignInNeeded a={agent} feed={[said('Not logged in · Please run /login')]} />);
  expect(screen.getByRole('alert')).toHaveTextContent("Claude Code isn't signed in on the computer that runs Planner");
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to Claude Code' }));
  expect(calls.some((c) => c.startsWith('POST') && c.includes('/api/clis/claude/login?host=pc-1'))).toBe(true);
  expect(await screen.findByRole('link', { name: 'Open the sign-in page' })).toHaveAttribute('href', 'https://claude.ai/oauth?x=1');
});

it('stays out of the way when the agent is signed in', () => {
  render(<SignInNeeded a={agent} feed={[said('Done: split into two tasks.')]} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

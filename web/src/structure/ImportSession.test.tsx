import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ImportRun } from './ImportRun';

afterEach(() => vi.restoreAllMocks());
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const preview = {
  source: 'imported:claude-code', agents: 4, subagents: 3, started_ms: 0, ended_ms: 7_200_000,
  tokens: { input: 1_000_000, output: 200_000, cache_read: 0, cache_write: 0 },
  missing: ['Explore db: its file (subagents/agent-*.jsonl next to the session) was not included'], unknown_lines: 2,
};

it('converts a Claude Code session, shows what was found, then imports it', async () => {
  const calls: { url: string; body: string }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    if (String(url).endsWith('/api/runs/convert')) return reply({ preview, warnings: [], session: 'SESSION-TEXT' });
    return reply({ team: { draft: { id: 't1', name: 'Login page' } }, run: { start_seq: -1 }, warnings: [] });
  });
  const onCreated = vi.fn();
  render(<ImportRun onCreated={onCreated} />);
  const main = new File(['{"type":"user","sessionId":"s","message":{"role":"user","content":"hi"}}\n'], 'main.jsonl');
  await userEvent.upload(screen.getByLabelText('Session or run files'), main);
  expect(await screen.findByText(/Claude Code session · 1 main agent, 3 subagents/)).toBeInTheDocument();
  expect(screen.getByText(/Explore db: its file/)).toBeInTheDocument();
  expect(screen.getByText(/2 lines Sculptured did not recognise/)).toBeInTheDocument();
  expect(JSON.parse(calls[0].body)).toEqual({ files: [{ name: 'main.jsonl', text: expect.stringContaining('"sessionId"') }] });
  await userEvent.click(screen.getByRole('button', { name: 'Import anyway' }));
  expect(onCreated).toHaveBeenCalledWith('t1', { history: true });
  const imported = calls.filter((c) => c.url.endsWith('/api/runs/import'));
  expect(imported).toHaveLength(1);
  expect(imported[0].body).toBe('SESSION-TEXT');
});

it('cancelling the preview imports nothing', async () => {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    calls.push(String(url));
    return reply({ preview: { ...preview, missing: [] }, warnings: [], session: 'S' });
  });
  render(<ImportRun onCreated={vi.fn()} />);
  await userEvent.upload(screen.getByLabelText('Session or run files'), new File(['{"type":"user","sessionId":"s"}\n'], 'main.jsonl'));
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText(/Claude Code session/)).toBeNull();
  expect(calls.some((c) => c.endsWith('/api/runs/import'))).toBe(false);
});

it('still imports a Sculptured run file directly', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply({ team: { draft: { id: 't2', name: 'x' } }, run: { start_seq: -2 }, warnings: [] }));
  const onCreated = vi.fn();
  render(<ImportRun onCreated={onCreated} />);
  await userEvent.upload(screen.getByLabelText('Session or run files'), new File(['{"format":"sculptured.session/v1"}\n'], 'r.jsonl'));
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith('t2', { history: true }));
});

it('a file that is not a session says why, by line', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply({ error: { code: 'session_file_invalid', message: "This isn't a Claude Code or Codex session file", diagnostics: [{ path: 'line 1', severity: 'error', message: 'x.jsonl: nope' }] } }, 422));
  render(<ImportRun onCreated={vi.fn()} />);
  await userEvent.upload(screen.getByLabelText('Session or run files'), new File(['nope'], 'x.jsonl'));
  expect(await screen.findByText(/isn't a Claude Code or Codex session file/)).toBeInTheDocument();
  expect(screen.getByText('line 1')).toBeInTheDocument();
});

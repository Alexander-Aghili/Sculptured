import { describe, expect, it } from 'vitest';
import type { EventBody } from '../generated/EventBody';
import type { EventRecord } from '../generated/EventRecord';
import { HANDOFF_ACTOR, TEAM_START_ACTOR } from '../conversation';
import { ev } from '../test-fixtures';
import { deriveProcess, fileTree } from './process';

const at = (seq: number, ms: number, body: EventBody, actor?: EventRecord['actor']): EventRecord => ({ ...ev(seq, body), at_ms: ms, ...(actor ? { actor } : {}) });
const call = (seq: number, ms: number, id: string, name: string, input: unknown, turn = 't1') =>
  at(seq, ms, { type: 'tool-called', turn_id: turn, call_id: id, name, input: input as never, parent_call_id: null });
const result = (seq: number, ms: number, id: string, output: string, isError = false, turn = 't1') =>
  at(seq, ms, { type: 'tool-resulted', turn_id: turn, call_id: id, output, is_error: isError });

/** A two-turn session: a Job that reads, edits and tests, then an operator follow-up. */
function session(): EventRecord[] {
  return [
    at(1, 0, { type: 'tenure-started', tenure: 1, cause: 'fresh', driver: 'claude', native_session_id: null, caps: {} as never }),
    at(2, 10, { type: 'message-queued', message_id: 'job', intent: 'inform', text: 'Build the login page\nwith a form' }, { kind: 'system', id: TEAM_START_ACTOR }),
    at(3, 100, { type: 'turn-started', turn_id: 't1' }),
    at(4, 110, { type: 'message-consumed', message_id: 'job', turn_id: 't1' }),
    call(5, 200, 'r1', 'Read', { file_path: '/w/src/App.tsx' }),
    result(6, 250, 'r1', 'export default App'),
    call(7, 300, 'e1', 'Edit', { file_path: '/w/src/App.tsx', old_string: 'a', new_string: 'b' }),
    result(8, 320, 'e1', 'ok'),
    call(9, 400, 'w1', 'Write', { file_path: '/w/src/Login.tsx', content: 'export {}' }),
    result(10, 410, 'w1', 'File created successfully at: /w/src/Login.tsx'),
    call(11, 500, 'b1', 'Bash', { command: 'npm test' }),
    result(12, 2500, 'b1', 'Exit code 1\nTests: 1 failed, 4 passed', true),
    call(13, 2600, 'b2', 'Bash', { command: 'ls' }),
    result(14, 2700, 'b2', 'src'),
    at(15, 2800, { type: 'agent-text', turn_id: 't1', text: 'Added the login page.\nAll tests pass now.' }),
    at(16, 2900, { type: 'usage-reported', turn_id: 't1', input_tokens: 100, output_tokens: 20, cache_read_tokens: 0, cache_write_tokens: 0 }),
    at(17, 3000, { type: 'turn-ended', turn_id: 't1', status: 'completed' }),
    at(18, 4000, { type: 'message-queued', message_id: 'op', intent: 'instruct', text: 'Fix the failing test' }, { kind: 'human', id: 'operator' }),
    at(19, 4100, { type: 'turn-started', turn_id: 't2' }),
    at(20, 4110, { type: 'message-consumed', message_id: 'op', turn_id: 't2' }),
    call(21, 4200, 'e2', 'Edit', { file_path: '/w/src/Login.tsx', old_string: 'export {}', new_string: 'export const x = 1' }, 't2'),
  ];
}

describe('deriveProcess', () => {
  it('makes one phase per turn with what started it, its tools, its reply and its end', () => {
    const p = deriveProcess(session());
    expect(p.phases).toHaveLength(2);
    const [one, two] = p.phases;
    expect(one).toMatchObject({ n: 1, turnId: 't1', status: 'completed', startMs: 100, endMs: 3000, tokens: { input: 100, output: 20 }, anchorKey: 'm-job', endKey: 'e-17' });
    expect(one.triggers).toEqual([expect.objectContaining({ kind: 'job', key: 'm-job', firstLine: 'Build the login page', state: 'consumed' })]);
    expect(one.steps.map((s) => [s.kind, s.summary, s.status])).toEqual([
      ['read', '/w/src/App.tsx', 'ok'],
      ['edit', '/w/src/App.tsx', 'ok'],
      ['edit', '/w/src/Login.tsx', 'ok'],
      ['bash', 'npm test', 'error'],
      ['bash', 'ls', 'ok'],
    ]);
    expect(one.steps[3]).toMatchObject({ key: 't-b1-11', ms: 2000 });
    expect(one.counts).toEqual({ read: 1, edit: 2, bash: 2 });
    expect(one.failedSteps).toBe(1);
    expect(one.reply).toMatchObject({ key: 'a-15', firstLine: 'Added the login page.', provenance: 'protocol-observed' });
    expect(two).toMatchObject({ n: 2, status: 'running', endMs: null, tokens: null });
    expect(two.triggers[0]).toMatchObject({ kind: 'operator', firstLine: 'Fix the failing test' });
    expect(two.steps[0].status).toBe('running');
  });

  it('lists every file read or changed, with counts, changes and the last action', () => {
    const p = deriveProcess(session());
    expect(p.files.map((f) => [f.path, f.reads, f.changes.length, f.last.action, f.last.phase])).toEqual([
      ['/w/src/App.tsx', 1, 1, 'edited', 1],
      ['/w/src/Login.tsx', 0, 2, 'edited', 2],
    ]);
    const login = p.files[1];
    expect(login.changes[0]).toMatchObject({ action: 'created', phase: 1, key: 't-w1-9', status: 'ok' });
    expect(login.changes[1]).toMatchObject({ action: 'edited', phase: 2, status: 'running', hunks: [{ old: 'export {}', new: 'export const x = 1' }] });
  });

  it('finds check commands with what their result shows, and the agent’s claims as reported', () => {
    const p = deriveProcess(session());
    expect(p.checks).toEqual([
      expect.objectContaining({ key: 't-b1-11', phase: 1, command: 'npm test', kind: 'test', outcome: expect.objectContaining({ status: 'error', exit: 1, line: 'Tests: 1 failed, 4 passed' }) }),
    ]);
    expect(p.claims).toEqual([{ key: 'a-15', phase: 1, text: 'All tests pass now.' }]);
  });

  it('sums up the session', () => {
    const p = deriveProcess(session());
    expect(p.summary).toEqual({
      turns: 2,
      toolCalls: 6,
      byKind: { read: 1, edit: 3, bash: 2, search: 0, web: 0, task: 0, other: 0 },
      filesChanged: 2,
      filesRead: 1,
      commands: 2,
      checks: 1,
      checksWithError: 1,
      failedSteps: 1,
      lastActivityMs: 4200,
      sessions: 1,
    });
  });

  it('marks a turn cut off when the session ends inside it, and lists messages never sent', () => {
    const p = deriveProcess([
      at(1, 0, { type: 'turn-started', turn_id: 't1' }),
      at(2, 5, { type: 'message-queued', message_id: 'late', intent: 'inform', text: 'later' }),
      at(3, 10, { type: 'tenure-ended', tenure: 1, exit_code: 3, signal: null, stderr_tail: '' }),
      at(4, 20, { type: 'message-queued', message_id: 'h', intent: 'inform', text: "Handed over by Planner\n--- Planner's result ---\nPlan" }, { kind: 'system', id: HANDOFF_ACTOR }),
    ]);
    expect(p.phases[0].status).toBe('cut-off');
    expect(p.waiting.map((w) => [w.key, w.state, w.reason])).toEqual([
      ['m-late', 'failed', 'the agent stopped before reading this message'],
      ['m-h', 'queued', undefined],
    ]);
    expect(p.waiting[1]).toMatchObject({ kind: 'handoff', from: ['Planner'], firstLine: 'Handed over by Planner' });
  });

  it('puts calls outside any turn into their own phase rather than dropping them', () => {
    const p = deriveProcess([call(1, 0, 'x', 'Bash', { command: 'ls' }, null as never)]);
    expect(p.phases).toHaveLength(1);
    expect(p.phases[0]).toMatchObject({ turnId: null, status: 'running', anchorKey: 't-x-1' });
  });

  it('is empty for no events', () => {
    const p = deriveProcess([]);
    expect(p.phases).toEqual([]);
    expect(p.summary.lastActivityMs).toBeNull();
  });
});

describe('fileTree', () => {
  it('groups paths under their common folder and folds single-child folders', () => {
    const t = fileTree(['/w/src/a.ts', '/w/src/ui/b.tsx', '/w/src/ui/c.tsx', '/w/README.md']);
    expect(t.root).toBe('/w');
    expect(t.nodes.map((n) => n.name)).toEqual(['src', 'README.md']);
    const src = t.nodes[0];
    expect(src.children.map((n) => n.name)).toEqual(['ui', 'a.ts']);
    expect(src.children[0].children.map((n) => n.path)).toEqual(['/w/src/ui/b.tsx', '/w/src/ui/c.tsx']);
    const deep = fileTree(['/w/a/b/c/x.ts', '/w/a/b/c/y.ts', '/w/z.ts']);
    expect(deep.nodes[0].name).toBe('a/b/c');
    expect(fileTree(['rel.ts']).nodes[0]).toMatchObject({ name: 'rel.ts', path: 'rel.ts' });
  });
});

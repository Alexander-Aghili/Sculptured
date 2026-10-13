import { describe, expect, it } from 'vitest';
import type { EventBody } from '../generated/EventBody';
import type { EventRecord } from '../generated/EventRecord';
import { ev } from '../test-fixtures';
import { activityLines } from './sentences';

const names: Record<string, string> = { 'team.builder@t': 'Builder', 'team.reviewer@t': 'Reviewer', 'team.planner@t': 'Planner' };
const nameOf = (id: string) => names[id] ?? 'unknown agent';
const at = (seq: number, body: EventBody, seat: string, actor: EventRecord['actor'] = { kind: 'system', id: 'hostd' }): EventRecord => ({ ...ev(seq, body, seat), actor });
const texts = (events: EventRecord[]) => activityLines(events, nameOf).map((l) => l.text);

describe('activityLines', () => {
  it('writes the spec examples, newest first', () => {
    // The Planner was running, so its non-zero exit was not asked for: "unexpectedly" is inferred.
    const events = [
      at(0, { type: 'seat-lifecycle-changed', lifecycle: 'running', reason: null }, 'team.planner@t'),
      at(1, { type: 'message-queued', message_id: 'm1', intent: 'inform', text: 'hi' }, 'team.reviewer@t', { kind: 'human', id: 'local' }),
      at(2, { type: 'message-delivered', message_id: 'm1' }, 'team.reviewer@t'),
      at(3, { type: 'message-consumed', message_id: 'm1', turn_id: 't1' }, 'team.reviewer@t'),
      at(4, { type: 'turn-ended', turn_id: 't9', status: 'completed' }, 'team.builder@t'),
      at(5, { type: 'tenure-ended', tenure: 1, exit_code: 3, signal: null, stderr_tail: 'boom' }, 'team.planner@t'),
    ];
    expect(texts(events)).toEqual([
      'Planner stopped unexpectedly (exit code 3)',
      'Builder finished a turn',
      'You sent Reviewer a message (delivered, then read)',
      'Planner started',
    ]);
  });

  it('labels a Job sent at start, and one that could not be sent', () => {
    const job = (seq: number, id: string) =>
      at(seq, { type: 'message-queued', message_id: id, intent: 'inform', text: 'Build it' }, 'team.builder@t', { kind: 'system', id: 'team-start' });
    expect(texts([job(1, 'j1')])).toEqual(["Builder's job was sent at start (waiting to be delivered)"]);
    expect(
      texts([job(1, 'j2'), at(2, { type: 'message-failed', message_id: 'j2', reason: 'not sent: the agent did not start (launch failed)' }, 'team.builder@t')]),
    ).toEqual(["Builder's job was not sent (the agent did not start (launch failed))"]);
  });

  it('says who handed work to whom, and when a handoff could not be sent', () => {
    const handoff = (seq: number, id: string, text: string) =>
      at(seq, { type: 'message-queued', message_id: id, intent: 'inform', text }, 'team.reviewer@t', { kind: 'system', id: 'handoff' });
    expect(texts([handoff(1, 'h1', "Handed over by Builder, Planner\n\nReview it\n\n--- Builder's result ---\nok")])).toEqual([
      'Builder, Planner handed work to Reviewer (waiting to be delivered)',
    ]);
    expect(texts([handoff(1, 'h2', "More work from Builder\n\n--- Builder's result ---\nmore")])).toEqual([
      'Builder handed more work to Reviewer (waiting to be delivered)',
    ]);
    expect(
      texts([
        handoff(1, 'h3', 'Handed over by Builder'),
        at(2, { type: 'message-failed', message_id: 'h3', reason: 'not sent: the team was stopped before Reviewer got this handoff' }, 'team.reviewer@t'),
      ]),
    ).toEqual(['Builder handed work to Reviewer, but it was not sent (the team was stopped before Reviewer got this handoff)']);
  });

  it('logs a stuck handoff and a Hand over again request, but not plain waiting', () => {
    const sys = { kind: 'system' as const, id: 'handoff' };
    expect(
      texts([
        at(1, { type: 'handoff-waiting', waiting_for: ['team.builder@t'], stuck: null }, 'team.reviewer@t', sys),
        at(2, { type: 'handoff-waiting', waiting_for: ['team.builder@t'], stuck: { reason: 'Builder needs attention', can_resend: false } }, 'team.reviewer@t', sys),
        at(3, { type: 'handover-requested', turn_id: 'turn-1', turn_seq: 2 }, 'team.builder@t', { kind: 'human', id: 'local' }),
      ]),
    ).toEqual(['You asked Builder to hand its latest finished turn over again', 'Reviewer is stuck: Builder needs attention']);
  });

  it('describes tools, replies, lifecycle and gaps without inventing anything', () => {
    const lines = texts([
      at(1, { type: 'seat-lifecycle-changed', lifecycle: 'running', reason: null }, 'team.builder@t'),
      at(2, { type: 'tool-called', turn_id: 't', call_id: 'c1', name: 'Bash', input: { command: 'cargo test' }, parent_call_id: null }, 'team.builder@t'),
      at(3, { type: 'tool-resulted', turn_id: 't', call_id: 'c1', output: 'boom', is_error: true }, 'team.builder@t'),
      at(4, { type: 'tool-called', turn_id: 't', call_id: 'c2', name: 'Edit', input: { file_path: 'src/lib.rs' }, parent_call_id: null }, 'team.builder@t'),
      at(5, { type: 'agent-text', turn_id: 't', text: 'Done.\nMore detail' }, 'team.builder@t'),
      at(6, { type: 'seat-lifecycle-changed', lifecycle: 'attention', reason: null }, 'team.reviewer@t'),
      at(7, { type: 'events-lost', count: 4 }, 'team.builder@t'),
      at(8, { type: 'usage-reported', turn_id: 't', input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0 }, 'team.builder@t'),
    ]);
    expect(lines).toEqual([
      '4 events were lost; the log has a gap',
      'Reviewer needs attention: reason unknown',
      'Builder replied: “Done.”',
      'Builder edited src/lib.rs',
      "Builder's Bash call failed",
      'Builder ran a shell command: cargo test',
      'Builder started',
    ]);
  });

  it('a stop the operator asked for is not "unexpected"', () => {
    expect(
      texts([
        at(1, { type: 'seat-lifecycle-changed', lifecycle: 'stopping', reason: null }, 'team.builder@t'),
        at(2, { type: 'tenure-ended', tenure: 1, exit_code: null, signal: 15, stderr_tail: '' }, 'team.builder@t'),
      ])[0],
    ).toBe("Builder's session ended (signal 15)");
  });

  it('labels inferred and folded lines heuristic, and keeps each event\'s own provenance otherwise', () => {
    const reported = (e: EventRecord): EventRecord => ({ ...e, provenance: 'agent-reported' });
    const lines = activityLines(
      [
        at(1, { type: 'seat-lifecycle-changed', lifecycle: 'running', reason: null }, 'team.planner@t'),
        at(2, { type: 'tenure-ended', tenure: 1, exit_code: 3, signal: null, stderr_tail: '' }, 'team.planner@t'),
        at(3, { type: 'message-queued', message_id: 'm1', intent: 'inform', text: 'hi' }, 'team.reviewer@t', { kind: 'human', id: 'local' }),
        at(4, { type: 'message-consumed', message_id: 'm1', turn_id: 't1' }, 'team.reviewer@t'),
        reported(at(5, { type: 'agent-text', turn_id: 't', text: 'All tests pass.' }, 'team.builder@t')),
        reported(at(6, { type: 'tool-called', turn_id: 't', call_id: 'c1', name: 'Bash', input: { command: 'ls' }, parent_call_id: null }, 'team.builder@t')),
        at(7, { type: 'tool-resulted', turn_id: 't', call_id: 'c1', output: 'boom', is_error: true }, 'team.builder@t'),
      ],
      nameOf,
    );
    expect(lines.map((l) => [l.text, l.provenance])).toEqual([
      ["Builder's Bash call failed", 'heuristic'],
      ['Builder ran a shell command: ls', 'agent-reported'],
      ['Builder replied: “All tests pass.”', 'agent-reported'],
      ['You sent Reviewer a message (delivered, then read)', 'heuristic'],
      ['Planner stopped unexpectedly (exit code 3)', 'heuristic'],
      ['Planner started', 'protocol-observed'],
    ]);
  });

  it('does not claim "unexpectedly" when no earlier lifecycle is in the window', () => {
    const [line] = activityLines([at(1, { type: 'tenure-ended', tenure: 1, exit_code: 3, signal: null, stderr_tail: '' }, 'team.planner@t')], nameOf);
    expect(line.text).toBe('Planner stopped (exit code 3)');
    expect(line.provenance).toBe('protocol-observed');
  });

  it('says the tool is unknown when its call is outside the window, and never borrows another agent\'s call', () => {
    expect(
      texts([
        at(1, { type: 'tool-called', turn_id: 't', call_id: 'c1', name: 'Bash', input: { command: 'ls' }, parent_call_id: null }, 'team.reviewer@t'),
        at(2, { type: 'tool-resulted', turn_id: 't', call_id: 'c1', output: 'boom', is_error: true }, 'team.builder@t'),
        at(3, { type: 'tool-resulted', turn_id: 't', call_id: 'c9', output: 'boom', is_error: true }, 'team.builder@t'),
      ]).slice(0, 2),
    ).toEqual(["Builder's tool call failed (tool unknown)", "Builder's tool call failed (tool unknown)"]);
  });

  it('sorts unsorted input newest first and does not mutate it', () => {
    const events = [
      at(3, { type: 'turn-ended', turn_id: 't3', status: 'completed' }, 'team.reviewer@t'),
      at(1, { type: 'turn-ended', turn_id: 't1', status: 'completed' }, 'team.builder@t'),
      at(2, { type: 'turn-ended', turn_id: 't2', status: 'failed' }, 'team.planner@t'),
    ];
    const before = structuredClone(events);
    expect(activityLines(events, nameOf).map((l) => l.seq)).toEqual([3, 2, 1]);
    expect(events).toEqual(before);
  });

  it('is pure and ignores duplicates', () => {
    const e = at(1, { type: 'turn-ended', turn_id: 't', status: 'interrupted' }, 'team.builder@t');
    expect(activityLines([e, e], nameOf)).toEqual(activityLines([e], nameOf));
    expect(texts([e])).toEqual(["Builder's turn was interrupted"]);
  });
});

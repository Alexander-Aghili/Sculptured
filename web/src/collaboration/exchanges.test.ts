import { describe, expect, it } from 'vitest';
import { ev } from '../test-fixtures';
import { teamExchanges } from './exchanges';

describe('team communication evidence', () => {
  it('joins captured handoff participants to the actual message and its delivery', () => {
    const message = ev(2, { type: 'message-queued', message_id: 'm', intent: 'inform', text: 'Team architecture (operator configuration): brief\n\n--- Current message ---\nReview the implementation.' }, 'dev.b@r');
    const rows = teamExchanges([
      ev(5, { type: 'message-consumed', message_id: 'm', turn_id: 'review' }, 'dev.b@r'),
      message, message,
      ev(3, { type: 'handed-over', start_seq: 1, message_id: 'm', from: [{ seat: 'dev.a@r', turn_id: 'build', turn_seq: 1, requested_seq: null }], resend_of: null, wave: null }, 'dev.b@r'),
      ev(4, { type: 'message-delivered', message_id: 'm' }, 'dev.b@r'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from: ['dev.a@r'], agent: 'dev.b@r', label: 'Handoff', text: 'Review the implementation.', status: 'Read', item: 'm-m' });
    expect(rows[0].event.body).toEqual(message.body);
  });
  it('keeps missing content and delivery unknown rather than inventing a result', () => {
    const rows = teamExchanges([ev(3, { type: 'handed-over', start_seq: 1, message_id: 'missing', from: [], resend_of: null, wave: null })]);
    expect(rows[0].status).toBe('Delivery unknown');
    expect(rows[0].text).toContain('outside the loaded history');
  });
  it('keeps intermediate replies and result submissions agent-reported; omits tool noise and turn completion', () => {
    const rows = teamExchanges([
      ev(1, { type: 'agent-text', turn_id: 't', text: 'I am still checking.' }),
      ev(2, { type: 'tool-called', turn_id: 't', call_id: 'c', name: 'mcp__rig__complete_work', input: { result: 'done' }, parent_call_id: null }),
      ev(3, { type: 'tool-resulted', turn_id: 't', call_id: 'c', output: 'ok', is_error: false }),
      ev(4, { type: 'turn-ended', turn_id: 't', status: 'completed' }),
      ev(5, { type: 'findings-reported', turn_id: 't', summary: 'Looks good', findings: [], verdict: 'no-problems' }),
    ]);
    expect(rows.map(r => r.label)).toEqual(['Reported findings', 'Result submitted', 'Update']);
    expect(rows.every(r => r.reported)).toBe(true);
    expect(rows[1].item).toBe('t-c-2');
  });
  it('shows human attribution and a captured delivery failure', () => {
    const message = ev(1, { type: 'message-queued', message_id: 'm', intent: 'instruct', text: 'Change the plan' });
    message.actor = { kind: 'human', id: 'operator' };
    const rows = teamExchanges([message, ev(2, { type: 'message-failed', message_id: 'm', reason: 'agent stopped' })]);
    expect(rows[0]).toMatchObject({ origin: 'You', status: 'Delivery failed: agent stopped' });
  });
});

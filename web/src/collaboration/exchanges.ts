import type { EventRecord } from '../generated/EventRecord';
import { splitTeamMessage } from '../teamMessage';

export type ExchangeKind = 'updates' | 'exchanges' | 'questions' | 'results';
export type Exchange = {
  key: string; event: EventRecord; agent: string; from: string[]; origin: string;
  kind: ExchangeKind; label: string; text: string; status?: string; item?: string;
  reported: boolean;
};

/** Only captured communication. Never infer collaboration from a planned connection. */
export function teamExchanges(events: EventRecord[]): Exchange[] {
  const sorted = [...new Map(events.map(e => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq);
  const handoffs = new Map<string, string[]>();
  const messages = new Set<string>();
  const status = new Map<string, string>();
  for (const e of sorted) {
    const b = e.body;
    if (b.type === 'handed-over') handoffs.set(b.message_id, b.from.map(f => f.seat));
    if (b.type === 'message-queued') messages.add(b.message_id);
    if (b.type === 'message-delivered') status.set(b.message_id, 'Delivered');
    if (b.type === 'message-consumed') status.set(b.message_id, 'Read');
    if (b.type === 'message-held' && !status.has(b.message_id)) status.set(b.message_id, 'Waiting for a slot');
    if (b.type === 'message-failed') status.set(b.message_id, `Delivery failed: ${b.reason}`);
  }
  const rows: Exchange[] = [];
  for (const e of sorted) {
    if (e.subject.kind !== 'seat') continue;
    const b = e.body;
    const base = { key: `${e.seq}`, event: e, agent: e.subject.id, from: [] as string[], origin: '', reported: false };
    if (b.type === 'agent-text' && b.text.trim()) {
      rows.push({ ...base, kind: 'updates', label: 'Update', text: b.text, reported: true, item: `a-${e.seq}` });
    } else if (b.type === 'message-queued') {
      const from = handoffs.get(b.message_id) ?? (e.actor.kind === 'seat' ? [e.actor.id] : []);
      const origin = e.actor.kind === 'human' ? 'You' : e.actor.kind === 'system' && e.actor.id === 'team-start' ? 'Team job' : 'System';
      rows.push({ ...base, from, origin, kind: 'exchanges', label: from.length ? 'Handoff' : 'Message',
        text: splitTeamMessage(b.text).text, status: status.get(b.message_id) ?? 'Queued · delivery not yet observed', item: `m-${b.message_id}` });
    } else if (b.type === 'handed-over' && !messages.has(b.message_id)) {
      rows.push({ ...base, from: handoffs.get(b.message_id) ?? [], kind: 'exchanges', label: 'Handoff',
        text: 'Message content is outside the loaded history. Open the receiving agent to inspect it.', status: status.get(b.message_id) ?? 'Delivery unknown' });
    } else if (b.type === 'question-raised') {
      rows.push({ ...base, kind: 'questions', label: 'Question raised', text: b.prompt.text, reported: true });
    } else if (b.type === 'findings-reported') {
      rows.push({ ...base, kind: 'results', label: 'Reported findings', text: b.summary, reported: true });
    } else if (b.type === 'tool-called' && /(?:^|[._/])(?:dispatch_work|complete_work)$/.test(b.name)) {
      rows.push({ ...base, kind: 'results', label: b.name.endsWith('dispatch_work') ? 'Dispatch requested' : 'Result submitted',
        text: JSON.stringify(b.input, null, 2), reported: true, item: `t-${b.call_id}-${e.seq}` });
    }
  }
  return rows.reverse();
}

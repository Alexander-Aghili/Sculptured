import { expect, it } from 'vitest';
import { isShortened, LIVE_TEXT_MAX, shortenForFeed } from './liveText';
import { mergeEvents } from './collaboration/mergeEvents';
import type { EventRecord } from './generated/EventRecord';

const ev = (seq: number, body: object) => ({ seq, at_ms: 1, body } as unknown as EventRecord);

it('keeps long tool output and handoff text short in the live list, and agent replies whole', () => {
  const long = 'x'.repeat(LIVE_TEXT_MAX * 3);
  const out = shortenForFeed(ev(1, { type: 'tool-resulted', output: long, call_id: 'c', is_error: false }));
  const text = (out.body as { output: string }).output;
  expect(text.length).toBe(LIVE_TEXT_MAX + 1);
  expect(text.endsWith('…')).toBe(true);
  expect(isShortened(out)).toBe(true);
  const reply = ev(2, { type: 'agent-text', text: long });
  expect(shortenForFeed(reply)).toBe(reply);
  const small = ev(3, { type: 'tool-called', input: { command: 'ls' } });
  expect(shortenForFeed(small)).toBe(small);
  expect(isShortened(small)).toBe(false);
});

it('prefers the stored full copy of an event over its shortened live copy', () => {
  const full = ev(1, { type: 'message-queued', text: 'y'.repeat(LIVE_TEXT_MAX * 2) });
  const merged = mergeEvents([full], { a: [shortenForFeed(full)] });
  expect(merged[0]).toBe(full);
});

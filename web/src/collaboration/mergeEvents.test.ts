import { expect, it } from 'vitest';
import { communicationEvents, mergeEvents } from './mergeEvents';
import type { EventRecord } from '../generated/EventRecord';

it('merges stored history and the live feed once per event, oldest first', () => {
  const e = (seq: number) => ({ seq } as EventRecord);
  expect(mergeEvents([e(1), e(3)], { a: [e(3), e(4)], b: [e(2)] }).map((x) => x.seq)).toEqual([1, 2, 3, 4]);
});

it('keeps only communication events, and returns the previous list while they are unchanged', () => {
  const e = (seq: number, type: string) => ({ seq, body: { type } } as unknown as EventRecord);
  const feed = { a: [e(2, 'tool-called'), e(3, 'message-queued')], b: [e(4, 'usage-reported')] };
  const first = communicationEvents([e(1, 'handed-over')], feed, null);
  expect(first.map((x) => x.seq)).toEqual([1, 3]);
  // A newer tool call arrives: nothing the arrows use changed, so the same list comes back.
  const later = { ...feed, a: [...feed.a, e(5, 'tool-resulted')] };
  expect(communicationEvents([e(1, 'handed-over')], later, first)).toBe(first);
  expect(communicationEvents([e(1, 'handed-over')], { ...later, b: [e(6, 'message-delivered')] }, first).map((x) => x.seq)).toEqual([1, 3, 6]);
});

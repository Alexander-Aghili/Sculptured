import { expect, it } from 'vitest';
import { mergeEvents } from './mergeEvents';
import type { EventRecord } from '../generated/EventRecord';

it('merges stored history and the live feed once per event, oldest first', () => {
  const e = (seq: number) => ({ seq } as EventRecord);
  expect(mergeEvents([e(1), e(3)], { a: [e(3), e(4)], b: [e(2)] }).map((x) => x.seq)).toEqual([1, 2, 3, 4]);
});

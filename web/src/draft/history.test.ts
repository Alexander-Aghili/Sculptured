import { describe, expect, it } from 'vitest';
import { type History, HISTORY_LIMIT, push, redo, start, undo } from './history';

describe('history', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    let h = push(push(start(0), 1), 2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    h = push(undo(h), 9);
    expect(h.future).toEqual([]);
    expect(undo(start(0))).toEqual(start(0));
  });

  it('coalesces consecutive edits with the same key into one undo step', () => {
    let h = push(start('a'), 'ab', 'name');
    h = push(h, 'abc', 'name');
    expect(undo(h).present).toBe('a');
    h = push(h, 'x', 'other');
    expect(undo(h).present).toBe('abc');
  });

  it('a coalesced edit also clears redo', () => {
    const h: History<string> = { past: ['a'], present: 'ab', future: ['x'], lastKey: 'name' };
    const next = push(h, 'abc', 'name');
    expect(next).toEqual({ past: ['a'], present: 'abc', future: [], lastKey: 'name' });
  });

  it('keeps at most HISTORY_LIMIT steps', () => {
    let h = start(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    // The oldest 20 steps were dropped: the earliest kept is the state after edit 20.
    expect(h.past[0]).toBe(20);
    expect(undo(h).present).toBe(HISTORY_LIMIT + 19);
  });
});

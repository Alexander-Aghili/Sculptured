import { afterEach, describe, expect, it, vi } from 'vitest';
import { batcher } from './batcher';

afterEach(() => vi.useRealTimers());

describe('batcher', () => {
  it('collects what arrives within the window and applies it once, in order', () => {
    vi.useFakeTimers();
    const applied: number[][] = [];
    const b = batcher<number>((xs) => applied.push(xs), 100);
    for (let i = 0; i < 300; i++) b.push(i);
    expect(applied).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toHaveLength(300);
    expect(applied[0].slice(0, 3)).toEqual([0, 1, 2]);
    b.push(300);
    vi.advanceTimersByTime(100);
    expect(applied).toEqual([applied[0], [300]]);
  });

  it('with no window, applies each item at once', () => {
    const applied: number[][] = [];
    const b = batcher<number>((xs) => applied.push(xs), 0);
    b.push(1);
    b.push(2);
    expect(applied).toEqual([[1], [2]]);
  });

  it('drops what is pending when cancelled', () => {
    vi.useFakeTimers();
    const applied: number[][] = [];
    const b = batcher<number>((xs) => applied.push(xs), 100);
    b.push(1);
    b.cancel();
    vi.advanceTimersByTime(500);
    expect(applied).toEqual([]);
  });
});

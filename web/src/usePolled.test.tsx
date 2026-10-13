import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePolled } from './usePolling';

afterEach(() => { vi.useRealTimers(); });

it('fetches now and on every interval, keeps the last good data and reports errors in words', async () => {
  vi.useFakeTimers();
  let fail = false, n = 0;
  const fetch = vi.fn(async () => { if (fail) throw new Error('offline'); return (n += 1); });
  const { result } = renderHook(() => usePolled(fetch, 1000, []));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(result.current.data).toBe(1);
  expect(result.current.at).toBeGreaterThan(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(result.current.data).toBe(2);
  fail = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(result.current.error).not.toBe('');
  expect(result.current.data).toBe(2);
  fail = false;
  await act(async () => { result.current.reload(); await vi.advanceTimersByTimeAsync(0); });
  expect([result.current.data, result.current.error]).toEqual([3, '']);
});

it('drops a late answer that belongs to the previous key', async () => {
  let release: (v: string) => void = () => {};
  const slow = () => new Promise<string>((r) => { release = r; });
  const { result, rerender } = renderHook(({ k }) => usePolled(k === 'a' ? slow : async () => 'b', 60000, [k]), { initialProps: { k: 'a' } });
  rerender({ k: 'b' });
  await waitFor(() => expect(result.current.data).toBe('b'));
  await act(async () => { release('a'); });
  expect(result.current.data).toBe('b');
});

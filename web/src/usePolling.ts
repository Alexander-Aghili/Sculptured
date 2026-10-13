import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { errorText } from './errors';

/** True while the component is mounted: a late answer checks it before setting state. */
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/** Calls `load` now, then every `ms` while mounted. */
export function usePolling(load: () => void, ms: number) {
  useEffect(() => {
    load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms]);
}

/**
 * Fetches now and every `ms` while mounted, keeping the latest answer and when it came (`at`). An error is shown in words and
 * the last good data stays. When `key` changes it fetches again at once (the old data shows until then), and a late
 * answer for the old key is dropped.
 */
export function usePolled<T>(fetch: () => Promise<T>, ms: number, key: readonly unknown[]): { data: T | null; error: string; at: number; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [at, setAt] = useState(0);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const latest = useRef(fetch);
  latest.current = fetch;
  const load = useCallback(() => {
    const mine = generation.current;
    latest.current().then(
      (next) => { if (generation.current === mine) { setData(next); setAt(Date.now()); setError(''); } },
      (e) => { if (generation.current === mine) setError(errorText(e)); },
    );
  }, []);
  useEffect(() => {
    generation.current += 1;
    load();
    const timer = setInterval(load, ms);
    return () => { generation.current += 1; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ms, ...key]);
  return { data, error, at, reload: load };
}

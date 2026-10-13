import { useCallback, useRef } from 'react';
import { ApiError, newRequestId } from './api';

/**
 * Runs one user action with a request id that makes a retry execute once. The id is
 * kept across a network failure (the retry may repeat a request that did arrive) and
 * renewed once the server answers, success or error, so the next action is new.
 */
export function useRequestOnce(): <T>(call: (requestId: string) => Promise<T>) => Promise<T> {
  const id = useRef(newRequestId());
  return useCallback(async <T,>(call: (requestId: string) => Promise<T>): Promise<T> => {
    try {
      const result = await call(id.current);
      id.current = newRequestId();
      return result;
    } catch (e) {
      if (e instanceof ApiError) id.current = newRequestId();
      throw e;
    }
  }, []);
}

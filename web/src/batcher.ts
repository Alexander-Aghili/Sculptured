/**
 * Collects items for `ms` and applies them together: a busy team sends hundreds of events a
 * second, and applying each on its own would redraw the page for every one. With `ms` 0 each
 * item applies at once (tests use that).
 */
export function batcher<T>(apply: (items: T[]) => void, ms: number) {
  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const items = queue;
    queue = [];
    if (items.length) apply(items);
  };
  return {
    push(item: T) {
      if (ms <= 0) return apply([item]);
      queue.push(item);
      timer ??= setTimeout(flush, ms);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      queue = [];
    },
  };
}

/** How long live events are collected before they are drawn; the test setup sets 0. */
export const STREAM_BATCH = { ms: 100 };

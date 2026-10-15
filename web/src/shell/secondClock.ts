import { useSyncExternalStore } from 'react';

/**
 * One shared once-a-second clock for everything that shows a running time: a busy team has dozens
 * of running tools, and a timer each would redraw the page hundreds of times a second.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    for (const l of listeners) l();
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const idle = () => () => {};

/** The current time, updated every second while `running`; otherwise it does not tick. */
export function useSecondClock(running: boolean): number {
  return useSyncExternalStore(running ? subscribe : idle, () => (running ? now : 0));
}

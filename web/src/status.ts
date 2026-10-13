import type { SeatLifecycle } from './generated/SeatLifecycle';
import type { SeatActivity } from './generated/SeatActivity';
import type { Severity } from './generated/Severity';

type Mark = { glyph: string; label: string };

/** Shape plus text for every state; colour is only ever an addition. */
export const LIFECYCLE: Record<SeatLifecycle, Mark> = {
  planned: { glyph: '○', label: 'planned' },
  launching: { glyph: '◌', label: 'launching' },
  running: { glyph: '●', label: 'running' },
  stopping: { glyph: '◑', label: 'stopping' },
  stopped: { glyph: '■', label: 'stopped' },
  stale: { glyph: '◇', label: 'stale' },
  attention: { glyph: '▲', label: 'needs attention' },
  failed: { glyph: '✕', label: 'failed' },
};

export const ACTIVITY: Record<SeatActivity, Mark> = {
  working: { glyph: '⚙', label: 'working' },
  'waiting-input': { glyph: '?', label: 'waiting for input' },
  idle: { glyph: '·', label: 'idle' },
  unknown: { glyph: '∅', label: 'unknown' },
};

const among = (states: SeatLifecycle[]) => (l: SeatLifecycle) => states.includes(l);

/** A process may be running for the agent (stale: last seen running, host unreachable). */
export const hasProcess = among(['running', 'launching', 'stopping', 'stale']);
/** Shown as needing the operator. */
export const needsAttention = among(['attention', 'failed', 'stale']);
/** Stop is offered (an agent in attention may still have a process). */
export const isStoppable = among(['running', 'launching', 'stale', 'attention']);
/** Restart is offered: stopped, failed, or needing attention. */
export const isRestartable = among(['attention', 'failed', 'stopped']);

/**
 * Activity, turn and tool describe a running process. They are current only while
 * the seat is running; while stale (host unreachable) they are the last known values;
 * otherwise there is no process, so they are not shown.
 */
export type TurnStateView = 'current' | 'last-known' | 'not-running';

export function turnStateView(lifecycle: SeatLifecycle): TurnStateView {
  if (lifecycle === 'running') return 'current';
  if (lifecycle === 'stale') return 'last-known';
  return 'not-running';
}

/** Diagnostic severity in words. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  'not-enforced': 'declared · not enforced',
};

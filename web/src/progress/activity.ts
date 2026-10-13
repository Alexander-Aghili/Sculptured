import type { SeatView } from '../generated/SeatView';
import { LIFECYCLE } from '../status';

const SHELL = new Set(['Bash', 'BashOutput', 'shell', 'exec_command', 'local_shell']);
const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const READ = new Set(['Read', 'Grep', 'Glob', 'LS']);

/** What a tool is doing, in words. Tools without a known meaning are named, not guessed. */
export function toolWords(tool: string): string {
  if (SHELL.has(tool)) return 'running a shell command';
  if (EDIT.has(tool)) return 'editing files';
  if (READ.has(tool)) return 'reading files';
  if (tool === 'Agent' || tool === 'Task') return 'running a helper agent';
  return `using ${tool}`;
}

function span(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`;
}

/** Time since the last recorded event, or "unknown". */
export function sinceText(lastEventMs: number | null, now: number): string {
  if (lastEventMs === null) return 'unknown';
  if (now - lastEventMs < 60_000) return 'just now';
  return `${span(now - lastEventMs)} ago`;
}

/** The agent's current activity in words, from its projected (protocol-observed) state only. */
export function describeActivity(seat: SeatView | undefined, now: number): string {
  if (!seat) return 'unknown';
  if (seat.lifecycle !== 'running') return LIFECYCLE[seat.lifecycle].label;
  if (seat.current_tool) return toolWords(seat.current_tool);
  switch (seat.activity) {
    case 'working':
      return 'working';
    case 'waiting-input':
      return 'waiting for input';
    case 'idle':
      if (seat.last_event_ms === null) return 'idle, for an unknown time';
      return now - seat.last_event_ms < 60_000 ? 'idle for under a minute' : `idle for ${span(now - seat.last_event_ms)}`;
    default:
      return 'unknown';
  }
}

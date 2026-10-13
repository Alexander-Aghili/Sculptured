import type { SeatView } from '../generated/SeatView';
import { needsAttention } from '../status';
import { plural } from '../format';

const count = (n: number, what: string) => `${plural(n, 'agent')} ${what}`;

type Bucket = 'working' | 'waiting' | 'idle' | 'starting' | 'notStarted' | 'stopped' | 'unknown' | 'attention';

/** The buckets told as "N agents <words>", in sentence order. */
const COUNTED: [Bucket, string][] = [
  ['working', 'working'],
  ['waiting', 'waiting for input'],
  ['idle', 'idle'],
  ['starting', 'starting or stopping'],
  ['notStarted', 'not started'],
  ['stopped', 'stopped'],
];


function runningBucket(seat: SeatView): Bucket {
  if (seat.current_tool || seat.activity === 'working') return 'working';
  if (seat.activity === 'waiting-input') return 'waiting';
  if (seat.activity === 'idle') return 'idle';
  return 'unknown';
}

function bucketOf(seat: SeatView | undefined): Bucket {
  if (!seat) return 'unknown';
  if (needsAttention(seat.lifecycle)) return 'attention';
  if (seat.lifecycle === 'running') return runningBucket(seat);
  if (seat.lifecycle === 'stopped') return 'stopped';
  if (seat.lifecycle === 'planned') return 'notStarted';
  if (seat.lifecycle === 'launching' || seat.lifecycle === 'stopping') return 'starting';
  return 'unknown';
}

/**
 * One sentence about the whole team, from projected seat state. A heuristic summary: the
 * UI labels it so. Agents without a status are counted as unknown, never guessed.
 */
export function nowSummary(agents: { name: string; seat: SeatView | undefined }[]): string {
  if (agents.length === 0) return 'This team has no agents yet.';
  const counts = new Map<Bucket, number>();
  const attention: string[] = [];
  for (const { name, seat } of agents) {
    const bucket = bucketOf(seat);
    if (bucket === 'attention') attention.push(`${name} — ${seat?.lifecycle_reason ?? 'reason unknown'}`);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const parts = COUNTED.filter(([b]) => counts.get(b)).map(([b, words]) => count(counts.get(b)!, words));
  const unknown = counts.get('unknown');
  if (unknown) parts.push(`${unknown} unknown`);
  if (attention.length) parts.push(`${attention.length} ${attention.length === 1 ? 'needs' : 'need'} attention: ${attention.join('; ')}`);
  return `${parts.join(', ')}.`;
}

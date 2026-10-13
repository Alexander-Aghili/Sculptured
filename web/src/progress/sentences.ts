import { splitTeamMessage } from '../teamMessage';
import { HANDOFF_ACTOR, TEAM_START_ACTOR } from '../conversation';
import type { EventBody } from '../generated/EventBody';
import type { EventRecord } from '../generated/EventRecord';
import type { Provenance } from '../generated/Provenance';
import type { SeatLifecycle } from '../generated/SeatLifecycle';
import { toolWords } from './activity';

export type LogLine = { key: string; seq: number; atMs: number; seatId: string | null; text: string; provenance: Provenance };

/** Provenance of a line that is inferred, or folded from more than one event. */
const INFERRED: Provenance = 'heuristic';

type Fate = { delivered: boolean; consumed: boolean; failed: string | null };

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function fateText(f: Fate | undefined): string {
  if (f?.failed) return `could not be delivered: ${f.failed}`;
  if (f?.consumed) return 'delivered, then read';
  if (f?.delivered) return 'delivered, not read yet';
  return 'waiting to be delivered';
}

/**
 * A team's events as readable sentences, newest first. Pure: the same events always give
 * the same lines. Message outcomes fold into the line of the message they belong to, and
 * events with nothing to say (usage, activity flips) produce no line.
 *
 * A line keeps its event's provenance, except a line that is inferred or folded from other
 * events (message outcomes, a tool name from its call, "unexpectedly"), which is `heuristic`.
 */
export function activityLines(events: EventRecord[], nameOf: (seatId: string) => string): LogLine[] {
  const sorted = [...new Map(events.map((e) => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq);
  const memory: Memory = { fates: messageFates(sorted), tools: new Map(), lastLifecycle: new Map() };
  const lines: LogLine[] = [];
  for (const e of sorted) {
    const seatId = e.subject.kind === 'seat' ? e.subject.id : null;
    const said = sentence({ e, seatId, who: seatId ? nameOf(seatId) : 'An agent', ...memory });
    if (said.text) {
      const provenance = said.inferred ? INFERRED : e.provenance;
      lines.push({ key: `${e.seq}`, seq: e.seq, atMs: e.at_ms, seatId, text: said.text, provenance });
    }
  }
  return lines.reverse();
}

/** What a sentence needs to remember across events. */
type Memory = { fates: Map<string, Fate>; tools: Map<string, string>; lastLifecycle: Map<string, SeatLifecycle> };
type Ctx = Memory & { e: EventRecord; seatId: string | null; who: string };
/** A line's text (null: nothing to say), and whether it is inferred rather than observed. */
type Said = { text: string | null; inferred?: boolean };
type Body<T extends EventBody['type']> = Extract<EventBody, { type: T }>;

/** Each message's outcome, folded from its delivered / consumed / failed events. */
function messageFates(sorted: EventRecord[]): Map<string, Fate> {
  const fates = new Map<string, Fate>();
  const fate = (id: string) => {
    const f = fates.get(id) ?? { delivered: false, consumed: false, failed: null };
    fates.set(id, f);
    return f;
  };
  for (const e of sorted) {
    const b = e.body;
    if (b.type === 'message-delivered') fate(b.message_id).delivered = true;
    else if (b.type === 'message-consumed') fate(b.message_id).consumed = true;
    else if (b.type === 'message-failed') fate(b.message_id).failed = b.reason;
  }
  return fates;
}

function sentence(c: Ctx): Said {
  const b = c.e.body;
  switch (b.type) {
    case 'message-queued':
      // The message's outcome (even "waiting") is read from other events, or their absence.
      return { text: queuedText(c, b), inferred: true };
    case 'handoff-waiting':
      // Only the stuck state is news; plain waiting shows on the agent itself.
      return { text: b.stuck ? `${c.who} is stuck: ${b.stuck.reason}` : null };
    case 'handover-requested':
      return { text: `You asked ${c.who} to hand its latest finished turn over again` };
    case 'seat-lifecycle-changed':
      if (c.seatId) c.lastLifecycle.set(c.seatId, b.lifecycle);
      return { text: lifecycleText(c.who, b) };
    case 'tenure-ended':
      return tenureSaid(c, b);
    case 'turn-ended':
      return { text: turnEndedText(c.who, b) };
    case 'tool-called':
      return { text: toolCalledText(c, b) };
    case 'tool-resulted':
      return toolResultSaid(c, b);
    default:
      return { text: plainText(c.who, b) };
  }
}

/** Sentences that need nothing but the event itself. */
function plainText(who: string, b: EventBody): string | null {
  if (b.type === 'agent-text') return `${who} replied: “${short(b.text.split('\n')[0], 80)}”`;
  if (b.type === 'events-lost') return `${b.count} events were lost; the log has a gap`;
  if (b.type === 'unrecognized') return `${who} sent something Sculptured does not recognise (kept in its Events)`;
  return null;
}

const notSent = (f: Fate) => f.failed!.replace(/^not sent: /, '');

function queuedText(c: Ctx, b: Body<'message-queued'>): string {
  const f = c.fates.get(b.message_id);
  const { actor } = c.e;
  if (actor.kind === 'system' && actor.id === TEAM_START_ACTOR)
    return f?.failed ? `${c.who}'s job was not sent (${notSent(f)})` : `${c.who}'s job was sent at start (${fateText(f)})`;
  if (actor.kind === 'system' && actor.id === HANDOFF_ACTOR) return handoffText(c.who, b.text, f);
  if (actor.kind === 'human') return `You sent ${c.who} a message (${fateText(f)})`;
  return `${c.who} received a message (${fateText(f)})`;
}

function handoffText(who: string, text: string, f: Fate | undefined): string {
  // The first line names the upstream agents ("Handed over by A, B" / "More work from A").
  const first = /^(Handed over by|More work from) (.+)$/.exec(splitTeamMessage(text).text.split('\n')[0].trim());
  const from = first?.[2] ?? 'An agent';
  const what = first?.[1] === 'More work from' ? 'more work' : 'work';
  return f?.failed
    ? `${from} handed ${what} to ${who}, but it was not sent (${notSent(f)})`
    : `${from} handed ${what} to ${who} (${fateText(f)})`;
}

function lifecycleText(who: string, b: Body<'seat-lifecycle-changed'>): string | null {
  const reason = b.reason ?? 'reason unknown';
  switch (b.lifecycle) {
    case 'running':
      return b.reason ? `${who} is running again (${b.reason})` : `${who} started`;
    case 'launching':
      return `${who} is starting`;
    case 'stopping':
      return `${who} is stopping`;
    case 'stopped':
      return `${who} stopped`;
    case 'attention':
      return `${who} needs attention: ${reason}`;
    case 'failed':
      return `${who} failed: ${reason}`;
    case 'stale':
      return `${who} cannot be reached: ${reason}`;
    default:
      return null;
  }
}

function tenureSaid(c: Ctx, b: Body<'tenure-ended'>): Said {
  const how = b.exit_code !== null ? `exit code ${b.exit_code}` : b.signal !== null ? `signal ${b.signal}` : 'exit code unknown';
  const last = c.seatId !== null ? c.lastLifecycle.get(c.seatId) : undefined;
  if (b.exit_code === 0) return { text: `${c.who}'s session ended` };
  if (last === 'stopping') return { text: `${c.who}'s session ended (${how})` };
  if (last === undefined) return { text: `${c.who} stopped (${how})` };
  // "Unexpectedly" is inferred from the earlier lifecycle: no stop was asked for.
  return { text: `${c.who} stopped unexpectedly (${how})`, inferred: true };
}

function turnEndedText(who: string, b: Body<'turn-ended'>): string {
  if (b.status === 'completed') return `${who} finished a turn`;
  return b.status === 'interrupted' ? `${who}'s turn was interrupted` : `${who}'s turn failed`;
}

function toolCalledText(c: Ctx, b: Body<'tool-called'>): string {
  c.tools.set(`${c.seatId}|${b.call_id}`, b.name);
  const input = (b.input ?? {}) as Record<string, unknown>;
  const actor = b.parent_call_id ? `${c.who}'s helper` : c.who;
  if (typeof input.command === 'string') return `${actor} ran a shell command: ${short(input.command, 80)}`;
  if (typeof input.file_path === 'string' && toolWords(b.name) === 'editing files') return `${actor} edited ${input.file_path}`;
  return `${actor} is ${toolWords(b.name)}`;
}

function toolResultSaid(c: Ctx, b: Body<'tool-resulted'>): Said {
  if (!b.is_error) return { text: null };
  const tool = c.tools.get(`${c.seatId}|${b.call_id}`);
  return tool ? { text: `${c.who}'s ${tool} call failed`, inferred: true } : { text: `${c.who}'s tool call failed (tool unknown)` };
}

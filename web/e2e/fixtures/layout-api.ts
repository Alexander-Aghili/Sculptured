import type { Page, Route } from '@playwright/test';
import type { Actor } from '../../src/generated/Actor';
import type { Provenance } from '../../src/generated/Provenance';
import type { JsonValue } from '../../src/generated/serde_json/JsonValue';
import type { CompiledRig } from '../../src/generated/CompiledRig';
import type { EventBody } from '../../src/generated/EventBody';
import type { EventRecord } from '../../src/generated/EventRecord';
import type { RigSnapshot } from '../../src/generated/RigSnapshot';
import type { SeatView } from '../../src/generated/SeatView';
import type { TeamRecord } from '../../src/generated/TeamRecord';
import type { TeamSummary } from '../../src/generated/TeamSummary';

/**
 * MOCKED API, for layout tests only. Every `/api/*` request is answered here from fixed
 * fixtures; nothing reaches a server. The content is deliberately long: an unbroken
 * 150-character path, a long URL, a 600-character message, a reply that claims "all tests
 * pass", many tool calls and a long attention reason. It pins how the UI lays out long
 * runtime text; it says nothing about the server's behaviour (the real-binary e2e specs do).
 */

export const RIG = 'layout-demo';
export const BUILDER = `build.builder@${RIG}`;
export const CHECKER = `build.checker@${RIG}`;
export const WRITER = `review.writer@${RIG}`;

const NOW = Date.now();
const LONG_PATH = `/home/someone/projects/${'very-long-unbroken-directory-name-'.repeat(3)}x/src/components/visual/process/turn-cards/VisualProgressLayoutFixture.tsx`;
const LONG_URL = 'https://example.invalid/ci/runs/0123456789abcdef0123456789abcdef0123456789abcdef?attempt=1&artifact=layout-report-with-a-very-long-name.json';
const HASH = 'sha256:9da9d1f59cbdc4fbc34422de22d503f275a7bfa71fea909d443e8cb4939204d2';

const MESSAGE = [
  `Please fix the overflow in ${LONG_PATH} and confirm with the report at ${LONG_URL}.`,
  'Keep the existing look. Make sure all tests pass before you reply, then summarise what changed, file by file,',
  'and say which checks you ran and what they printed. If anything is unclear, ask before you change the layout geometry,',
  `because the Structure board shares it. Build ${HASH} is the one to compare against.`,
].join(' ');

const REPLY = [
  `All tests pass: \`npm test\` printed 62 passed for ${LONG_PATH}, and the report at ${LONG_URL} is green.`,
  '',
  '## What changed',
  '',
  `- \`${LONG_PATH}\`: clamp the trigger and reply lines to two lines.`,
  '- `visual.css`: wrap long tokens in claims, paths and code.',
  '- `polish.css`: restore the card clamp and remove the nested scroller.',
  '',
  ...Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1}. The layout now keeps every card inside its panel at 1440 and 390 px wide, and the long path above wraps instead of pushing the panel wider than the screen.`),
].join('\n');

const JOB = `You are the builder. ${MESSAGE}\n\n${Array.from({ length: 10 }, (_, i) => `Rule ${i + 1}: keep runtime text verbatim; clamp it in summaries and show it in full in the transcript.`).join('\n')}`;

export const ADV = { model: null, permission: 'unrestricted', resume: 'resume-if-possible' } as const;
const caps = { interrupt: true, questions: false, resume: true, fork: false, usage: true, mid_turn_input: false, subagent_events: true };

export function seat(id: string, label: string, over: Partial<SeatView>): SeatView {
  const [pm, rig] = id.split('@');
  const [pod, member] = pm.split('.');
  return {
    id,
    rig,
    pod,
    member,
    runtime: 'claude-code',
    label,
    host: 'local',
    lifecycle: 'running',
    lifecycle_reason: null,
    activity: 'idle',
    tenure: 1,
    native_session_id: null,
    caps,
    current_turn: null,
    current_tool: null,
    last_event_ms: NOW - 20_000,
    tokens_in: 12_400,
    tokens_out: 3_100,
    lifecycle_provenance: 'protocol-observed',
    open_questions: 0,
    risk_count: 0,
    restore_offer: null,
    cwd: null,
    limit_hit: null,
    model_requested: null,
    model_observed: null,
    stalled: null,
    ...over,
  };
}

const LONG_NAME = 'Builder with a long name that needs two lines';

const seats: SeatView[] = [
  seat(BUILDER, LONG_NAME, { activity: 'working', current_turn: 'turn-2', current_tool: 'Bash' }),
  seat(CHECKER, 'Checker', {
    lifecycle: 'attention',
    lifecycle_reason: `The agent asked a question: may it overwrite ${LONG_PATH}? It also wants to know whether ${LONG_URL} is the right report to compare with.`,
  }),
  seat(WRITER, 'Writer', {}),
];

/** A seat as its compiled rig declares it. */
export function compiledSeat(s: SeatView): CompiledRig['seats'][number] {
  return {
    id: s.id,
    pod: s.pod,
    member: s.member,
    runtime: s.runtime,
    cwd: '/home/someone/projects/demo',
    agent_ref: 'builtin:sculptured-agent',
    profile: 'default',
    label: s.label,
    role: null,
    model: null,
    restore_policy: 'resume_if_possible',
    permission_policy: null,
  };
}

const compiled: CompiledRig = {
  name: RIG,
  summary: null,
  spec_hash: HASH,
  pods: [
    { id: 'build', label: 'Build' },
    { id: 'review', label: 'Review' },
  ],
  seats: seats.map(compiledSeat),
  edges: [
    { kind: 'delegates_to', from: BUILDER, to: WRITER, enforced: true },
    { kind: 'delegates_to', from: CHECKER, to: WRITER, enforced: true },
  ],
  launch_layers: [[BUILDER, CHECKER], [WRITER]],
  diagnostics: [],
};

const snapshot: RigSnapshot = { rig: compiled, desired: 'running', seats, last_seq: 10_000 };

const team: TeamRecord = {
  draft: {
    id: RIG,
    name: 'Layout demo · long content',
    revision: 1,
    groups: [
      { id: 'build', label: 'Build', x: 40, y: 40, w: 248, h: 520 },
      { id: 'review', label: 'Review', x: 400, y: 40, w: 248, h: 276 },
    ],
    agents: [
      { id: 'builder', group_id: 'build', name: LONG_NAME, kind: 'claude', job: JOB, folder: '/home/someone/projects/demo', x: 64, y: 92, advanced: ADV },
      { id: 'checker', group_id: 'build', name: 'Checker', kind: 'claude', job: 'Check the builder’s work.', folder: '/home/someone/projects/demo', x: 64, y: 324, advanced: ADV },
      { id: 'writer', group_id: 'review', name: 'Writer', kind: 'claude', job: 'Write the notes.', folder: '/home/someone/projects/demo', x: 424, y: 92, advanced: ADV },
    ],
    connections: [
      { id: 'c1', from: 'builder', to: 'writer', kind: 'hands-work-to' },
      { id: 'c2', from: 'checker', to: 'writer', kind: 'hands-work-to' },
    ],
  },
  started_revision: 1,
  live: true,
  issues: [],
};

const summary: TeamSummary = {
  id: RIG,
  name: team.draft.name,
  agent_count: 3,
  updated_at_ms: NOW,
  started: { name: RIG, desired: 'running', seat_count: 3, running_count: 3, attention_count: 1 },
};

/** Appends a seat's events in order, one and a half seconds apart. */
function recorder(id: string) {
  const out: EventRecord[] = [];
  let at = NOW - 30 * 60_000;
  const ev = (body: EventBody, actor: Actor = { kind: 'seat', id }, provenance: Provenance = 'protocol-observed') => {
    at += 1500;
    const seq = out.length + 1;
    out.push({ seq, host: 'local', host_seq: seq, at_ms: at, actor, subject: { kind: 'seat', id }, provenance, body });
  };
  const tool = (turn: string, n: number, name: string, input: JsonValue, output: string | null, isError = false) => {
    const call = `${turn}-call-${n}`;
    ev({ type: 'tool-called', turn_id: turn, call_id: call, name, input, parent_call_id: null });
    if (output !== null) ev({ type: 'tool-resulted', turn_id: turn, call_id: call, output, is_error: isError });
  };
  const message = (id: string, text: string, actor: Actor, turn: string) => {
    ev({ type: 'message-queued', message_id: id, intent: 'inform', text }, actor, 'operator');
    ev({ type: 'message-delivered', message_id: id });
    ev({ type: 'turn-started', turn_id: turn });
    ev({ type: 'message-consumed', message_id: id, turn_id: turn });
  };
  return { out, ev, tool, message };
}

/** Turn 1: the job, eighteen read/edit/test calls on long paths, one failing, and a long reply. */
function firstTurn({ ev, tool, message }: ReturnType<typeof recorder>) {
  ev({ type: 'seat-lifecycle-changed', lifecycle: 'running', reason: null }, { kind: 'system', id: 'hostd' });
  message('job', JOB, { kind: 'system', id: 'team-start' }, 'turn-1');
  for (let i = 0; i < 18; i++) {
    const file = LONG_PATH.replace('.tsx', `-${i}.tsx`);
    if (i % 3 === 0) tool('turn-1', i, 'Read', { file_path: file }, 'file contents');
    else if (i % 3 === 1) tool('turn-1', i, 'Edit', { file_path: file, old_string: 'white-space: normal', new_string: 'white-space: nowrap' }, 'ok');
    else tool('turn-1', i, 'Bash', { command: `cd ${LONG_PATH.slice(0, 90)} && npx vitest run ${LONG_URL}` }, `Tests  62 passed (62)\n${LONG_PATH}`, i === 5);
  }
  ev({ type: 'agent-text', turn_id: 'turn-1', text: REPLY }, undefined, 'agent-reported');
  ev({ type: 'usage-reported', turn_id: 'turn-1', input_tokens: 9_000, output_tokens: 2_100, cache_read_tokens: 120_000, cache_write_tokens: 4_000 });
  ev({ type: 'turn-ended', turn_id: 'turn-1', status: 'completed' });
}

/** Turn 2: your 600-character message, four more tools, a claim with a URL; the builder is still running a test. */
function secondTurn({ ev, tool, message }: ReturnType<typeof recorder>, running: boolean) {
  message('m2', MESSAGE, { kind: 'human', id: 'you' }, 'turn-2');
  tool('turn-2', 1, 'Bash', { command: `npm test -- ${LONG_PATH}` }, 'Tests  62 passed (62)');
  tool('turn-2', 2, 'Grep', { pattern: 'overflow-wrap', path: LONG_PATH }, '3 matches');
  tool('turn-2', 3, 'WebFetch', { url: LONG_URL }, 'ok');
  tool('turn-2', 4, 'Edit', { file_path: LONG_PATH, old_string: 'a', new_string: 'b' }, 'ok');
  ev({ type: 'agent-text', turn_id: 'turn-2', text: `Checked ${LONG_URL} and the build passes. Now running the layout suite for ${LONG_PATH}.` }, undefined, 'agent-reported');
  if (running) tool('turn-2', 5, 'Bash', { command: `npx playwright test e2e/layout.spec.ts ${LONG_PATH}` }, null);
  else ev({ type: 'turn-ended', turn_id: 'turn-2', status: 'completed' });
}

function history(id: string): EventRecord[] {
  const r = recorder(id);
  firstTurn(r);
  secondTurn(r, id === BUILDER);
  return r.out;
}

const histories: Record<string, EventRecord[]> = Object.fromEntries(seats.map((s) => [s.id, history(s.id)]));

/** GET answers by path; anything else is not in the fixture. */
function answer(path: string): unknown {
  const events = path.match(/^\/api\/seats\/(.+)\/events$/);
  if (events) return histories[events[1]] ?? [];
  const fixed: Record<string, unknown> = {
    '/api/rigs': [summary.started],
    [`/api/rigs/${RIG}`]: snapshot,
    '/api/teams': [summary],
    [`/api/teams/${RIG}`]: team,
    '/api/team-templates': [],
    '/api/folders': { path: '/home/someone', parent: null, home: '/home/someone', entries: [], truncated: false },
  };
  return fixed[path];
}

/** A stand-in EventSource: sends the snapshot (and 'ready') once and stays open, like a quiet live stream. */
function stubEventSource(snap: RigSnapshot) {
  class QuietStream {
    onerror: ((e: Event) => void) | null = null;
    private listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
    constructor() {
      setTimeout(() => {
        this.emit('snapshot', JSON.stringify(snap));
        this.emit('ready', '{}');
      }, 0);
    }
    addEventListener(type: string, fn: (e: MessageEvent) => void) {
      (this.listeners[type] ??= []).push(fn);
    }
    close() {}
    private emit(type: string, data: string) {
      for (const fn of this.listeners[type] ?? []) fn(new MessageEvent(type, { data }));
    }
  }
  (window as unknown as { EventSource: unknown }).EventSource = QuietStream;
}

const reply = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Answers every `/api/*` GET from `answerOf`, and the live stream from a stub sending `snap`. Writes are refused. */
export async function mockFixture(page: Page, snap: RigSnapshot, answerOf: (path: string) => unknown) {
  await page.addInitScript(stubEventSource, snap);
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return reply(route, 405, { error: { code: 'mocked', message: 'layout fixture is read-only' } });
    const body = answerOf(decodeURIComponent(new URL(req.url()).pathname));
    if (body === undefined) return reply(route, 404, { error: { code: 'not_found', message: 'not in the layout fixture' } });
    return reply(route, 200, body);
  });
}

/** The layout-demo team (long content). */
export const mockApi = (page: Page) => mockFixture(page, snapshot, answer);

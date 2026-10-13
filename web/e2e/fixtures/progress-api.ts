import type { Page } from '@playwright/test';
import type { EventRecord } from '../../src/generated/EventRecord';
import type { RigSnapshot } from '../../src/generated/RigSnapshot';
import type { TeamDraft } from '../../src/generated/TeamDraft';
import type { TeamRecord } from '../../src/generated/TeamRecord';
import type { TeamSummary } from '../../src/generated/TeamSummary';
import { ADV, compiledSeat, mockFixture, seat } from './layout-api';

/**
 * MOCKED API for the Progress page layout: a running team of 15 agents whose histories give
 * over 200 activity lines, and a team that has never started (its mode bar shows "not
 * started yet"). Layout only; nothing reaches a server.
 */

export const BIG = 'progress-demo';
export const DRAFT_ONLY = 'draft-demo';
const AGENTS = 15;
const TOOL_CALLS = 14;
const NOW = Date.now();

const agentIds = Array.from({ length: AGENTS }, (_, i) => `agent${i + 1}`);

function draft(id: string, name: string): TeamDraft {
  return {
    id,
    name,
    revision: 1,
    groups: [{ id: 'crew', label: 'Crew', x: 40, y: 40, w: 248, h: 3600 }],
    agents: agentIds.map((a, i) => ({ id: a, group_id: 'crew', name: `Agent ${i + 1} · geometry`, kind: 'claude', job: 'Build your part.', folder: '/home/someone/projects/demo', x: 64, y: 92 + i * 232, advanced: ADV })),
    connections: [],
  };
}

const seats = agentIds.map((a, i) => seat(`crew.${a}@${BIG}`, `Agent ${i + 1} · geometry`, { activity: 'working', current_tool: 'Bash' }));
const snapshot: RigSnapshot = {
  rig: { name: BIG, summary: null, spec_hash: 'sha256:0', pods: [{ id: 'crew', label: 'Crew' }], seats: seats.map(compiledSeat), edges: [], launch_layers: [seats.map((s) => s.id)], diagnostics: [] },
  desired: 'running',
  seats,
  last_seq: 10_000,
};

/** Each tool call is one activity line: 15 agents × 14 calls = 210 lines. */
function history(id: string, index: number): EventRecord[] {
  return Array.from({ length: TOOL_CALLS }, (_, n) => {
    const seq = index * TOOL_CALLS + n + 1;
    const body = { type: 'tool-called', turn_id: 't1', call_id: `c${n}`, name: 'Bash', input: { command: `npm run check -- part-${n}` }, parent_call_id: null } as const;
    return { seq, host: 'local', host_seq: seq, at_ms: NOW - 60_000 + seq * 100, actor: { kind: 'seat', id }, subject: { kind: 'seat', id }, provenance: 'protocol-observed', body };
  });
}

const histories = Object.fromEntries(seats.map((s, i) => [s.id, history(s.id, i)]));
const started: TeamRecord = { draft: draft(BIG, 'Progress demo · fifteen agents'), started_revision: 1, live: true, issues: [] };
const notStarted: TeamRecord = { draft: draft(DRAFT_ONLY, 'Airplane · Cessna 172P explorer'), started_revision: null, live: false, issues: [] };
const summaries: TeamSummary[] = [
  { id: BIG, name: started.draft.name, agent_count: AGENTS, updated_at_ms: NOW, started: { name: BIG, desired: 'running', seat_count: AGENTS, running_count: AGENTS, attention_count: 0 } },
  { id: DRAFT_ONLY, name: notStarted.draft.name, agent_count: AGENTS, updated_at_ms: NOW, started: null },
];

function answer(path: string): unknown {
  const events = path.match(/^\/api\/seats\/(.+)\/events$/);
  if (events) return histories[events[1]] ?? [];
  const fixed: Record<string, unknown> = {
    '/api/rigs': [summaries[0].started],
    [`/api/rigs/${BIG}`]: snapshot,
    '/api/teams': summaries,
    [`/api/teams/${BIG}`]: started,
    [`/api/teams/${DRAFT_ONLY}`]: notStarted,
    '/api/team-templates': [],
  };
  return fixed[path];
}

export const mockProgress = (page: Page) => mockFixture(page, snapshot, answer);

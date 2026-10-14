import type { DraftAgent } from '../generated/DraftAgent';
import type { GroupBlock } from '../generated/GroupBlock';
import type { TeamDraft } from '../generated/TeamDraft';
import { captureGroup, insertBlock } from '../groups/blocks';
import { fitGroups, type Selection } from './edits';
import { agentBox, COL, drawnGroups, firstFreeSlot, groupAt, looseAllowed, nearestGroup, overlaps, snap, type Point } from './geometry';
import { CARD_H, CARD_W } from '../layout';
import { newId, slug } from './ids';

/** What Copy put on the board clipboard: one agent, or a group with its agents and the arrows between them. */
export type BoardClip = { kind: 'agent'; agent: DraftAgent } | { kind: 'group'; block: GroupBlock };

/** Where a paste goes: at a board point, into a group, or (neither) beside the original. */
export type PasteAt = { at?: Point; into?: string };

export type Pasted = { draft: TeamDraft; select?: Selection; reason?: string };

const KEY = 'sculptured.board-clipboard';
let memory: BoardClip | null = null;

/** The selection as a clip, or null for an arrow or a group that isn't drawn. */
export function copyOf(d: TeamDraft, s: Selection): BoardClip | null {
  if (s.kind === 'agent') {
    const a = d.agents.find((x) => x.id === s.id);
    return a ? { kind: 'agent', agent: { ...a, advanced: { ...a.advanced } } } : null;
  }
  if (s.kind !== 'group' || !drawnGroups(d).some((g) => g.id === s.id)) return null;
  const block = captureGroup(d, s.id);
  const folders = new Map(d.agents.map((a) => [a.id, a.folder]));
  const agents = block.draft.agents.map((a) => ({ ...a, folder: folders.get(a.id) ?? null }));
  return { kind: 'group', block: { ...block, draft: { ...block.draft, agents } } };
}

const isClip = (v: unknown): v is BoardClip => {
  const c = v as BoardClip | null;
  if (c?.kind === 'agent') return typeof c.agent?.id === 'string' && typeof c.agent.name === 'string';
  return c?.kind === 'group' && Array.isArray(c.block?.draft?.groups) && Array.isArray(c.block.draft.agents);
};

/** Kept in this browser (other tabs and teams can paste it); in memory when storage is blocked. */
export function writeClip(c: BoardClip): void {
  memory = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Storage blocked (private window): this tab still has it.
  }
}

export function readClip(): BoardClip | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (isClip(v)) return v;
  } catch {
    // Unreadable or blocked: fall back to this tab's copy.
  }
  return memory;
}

/** `Planner` → `Planner 2`; `Builder 1` → the next free `Builder n`. */
export function copyName(name: string, d: TeamDraft): string {
  const used = new Set(d.agents.map((a) => a.name.trim().toLowerCase()));
  if (!used.has(name.trim().toLowerCase())) return name;
  const m = /^(.*?)(?:\s+(\d+))?$/.exec(name.trim())!;
  for (let n = Number(m[2] ?? 1) + 1; ; n++) {
    const next = `${m[1]} ${n}`;
    if (!used.has(next.toLowerCase())) return next;
  }
}

/** The first spot to the right of `p` (in board columns) where a card overlaps no agent. */
function besideFree(d: TeamDraft, p: Point): Point {
  for (let i = 1; i < 30; i++) {
    const q = { x: p.x + i * COL, y: p.y };
    if (!d.agents.some((a) => overlaps(agentBox(a), agentBox(q)))) return q;
  }
  return { x: p.x + COL, y: p.y };
}

/** Where a pasted agent goes, and in which group. */
function agentPlace(d: TeamDraft, src: DraftAgent, where: PasteAt): { pos: Point; group_id: string | null } {
  if (where.into) return { pos: firstFreeSlot(d, where.into) ?? besideFree(d, src), group_id: where.into };
  if (!where.at) return { pos: besideFree(d, src), group_id: d.groups.some((g) => g.id === src.group_id) ? src.group_id : null };
  const pos = { x: snap(where.at.x), y: snap(where.at.y) };
  const centre = { x: pos.x + CARD_W / 2, y: pos.y + CARD_H / 2 };
  const group_id = groupAt(d, centre);
  if (group_id !== null || looseAllowed(d) || drawnGroups(d).length === 0) return { pos, group_id };
  const nearest = nearestGroup(d, centre)!;
  return { pos: firstFreeSlot(d, nearest)!, group_id: nearest };
}

function pasteAgent(d: TeamDraft, src: DraftAgent, where: PasteAt): Pasted {
  const id = newId(slug(src.name, 'agent'), new Set(d.agents.map((a) => a.id)));
  const { pos, group_id } = agentPlace(d, src, where);
  const agent: DraftAgent = { ...src, id, name: copyName(src.name, d), group_id, x: pos.x, y: pos.y, advanced: { ...src.advanced } };
  return { draft: fitGroups({ ...d, agents: [...d.agents, agent] }, group_id ?? undefined), select: { kind: 'agent', id } };
}

/**
 * Adds a copy with fresh ids and free names. An agent keeps its job, kind, folder and settings
 * but no arrows; a group keeps its agents and the arrows between them.
 */
export function pasteClip(d: TeamDraft, c: BoardClip, where: PasteAt = {}): Pasted {
  if (c.kind === 'agent') return pasteAgent(d, c.agent, where);
  const at = where.at && { x: snap(where.at.x), y: snap(where.at.y) };
  const r = insertBlock(d, c.block, at, true);
  if (r.reason || !r.id) return { draft: d, reason: r.reason ?? 'This copy has no group to paste.' };
  return { draft: fitGroups(r.draft, r.id), select: { kind: 'group', id: r.id } };
}

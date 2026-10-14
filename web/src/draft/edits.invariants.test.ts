import { describe, expect, it } from 'vitest';
import type { DraftGroup } from '../generated/DraftGroup';
import type { TeamDraft } from '../generated/TeamDraft';
import { CARD_H, CARD_W } from '../layout';
import { draftAgent, teamDraft } from '../test-fixtures';
import {
  addAgent,
  addGroup,
  connect,
  fitGroups,
  moveAgent,
  moveGroup,
  moveToGroup,
  removeElement,
  renameAgent,
  renameGroup,
  renameTeam,
  setAdvanced,
  setConnectionKind,
  setFolder,
  setJob,
} from './edits';
import { agentBox, canvasSize, COL, connectionPath, draftLayout, drawnGroups, GRID, looseAllowed, nextFreeSlot, overlaps } from './geometry';
import { DEFAULT_GROUP_ID, seatIdFor } from './ids';

/**
 * A team saved before agents could be outside every group: its first group made the main group
 * explicit, so every agent belongs to a group. Those teams keep the old rules.
 */
const withMain = (d: TeamDraft): TeamDraft =>
  fitGroups({ ...d, groups: [{ id: DEFAULT_GROUP_ID, label: 'Main group', x: 16, y: 0, w: 248, h: 276 }], agents: d.agents.map((a) => ({ ...a, group_id: DEFAULT_GROUP_ID })) });

const grp = (id: string, x: number, y: number, w = 248, h = 276): DraftGroup => ({ id, label: id, x, y, w, h });

const inside = (a: { x: number; y: number }, g: DraftGroup) =>
  a.x >= g.x && a.y >= g.y && a.x + CARD_W <= g.x + g.w && a.y + CARD_H <= g.y + g.h;

/** Everything the Structure board relies on: separate group boxes and every card inside its own box. */
function violations(d: TeamDraft): string[] {
  const out: string[] = [];
  const gs = drawnGroups(d);
  for (let i = 0; i < gs.length; i++) {
    for (let j = i + 1; j < gs.length; j++) if (overlaps(gs[i], gs[j])) out.push(`groups ${gs[i].id} and ${gs[j].id} overlap`);
  }
  for (const g of d.groups) if (g.x < 0 || g.y < 0) out.push(`group ${g.id} is off the canvas`);
  for (const a of d.agents) {
    if (a.x < 0 || a.y < 0) out.push(`${a.id} is off the canvas`);
    if (d.groups.length === 0) continue;
    if (a.group_id === null && looseAllowed(d)) {
      for (const g of gs) if (overlaps(agentBox(a), g)) out.push(`${a.id}, in no group, sits under group ${g.id}`);
      continue;
    }
    const g = d.groups.find((x) => x.id === (a.group_id ?? DEFAULT_GROUP_ID));
    if (!g) out.push(`${a.id} belongs to a missing group ${a.group_id}`);
    else if (!inside(a, g)) out.push(`${a.id} sits outside its group ${g.id}`);
  }
  return out;
}

/** Edits only ever produce grid positions (the fixture's Reviewer at x 300 is not one). */
const offGrid = (d: TeamDraft) => d.agents.filter((a) => a.x % GRID !== 0 || a.y % GRID !== 0).map((a) => `${a.id} at ${a.x},${a.y}`);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** Deterministic PRNG so a failing sequence can be replayed from its seed. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('group boxes never overlap', () => {
  it('a group that grows to fit a card pushes a neighbour away, with its agents', () => {
    const d = teamDraft({
      groups: [grp('team', 16, 0, 248, 264), grp('g2', 280, 0)],
      agents: [draftAgent('builder', { x: 40, y: 40, group_id: 'team' }), draftAgent('reviewer', { x: 304, y: 48, group_id: 'g2' })],
    });
    expect(violations(d)).toEqual([]);
    const { draft } = moveAgent(d, 'builder', { x: 96, y: 40 });
    expect(draft.agents[0]).toMatchObject({ x: 96, y: 40, group_id: 'team' });
    expect(violations(draft)).toEqual([]);
    const g2 = draft.groups.find((g) => g.id === 'g2')!;
    const shift = g2.x - 280;
    expect(shift).toBeGreaterThan(0);
    expect(draft.agents[1]).toMatchObject({ x: 304 + shift, y: 48 });
  });

  it('adding an agent outside every group puts it in the nearest group, inside its box', () => {
    const { draft: grouped, id: gid } = addGroup(withMain(teamDraft()));
    const g = grouped.groups.find((x) => x.id === gid)!;
    const { draft, id } = addAgent(grouped, 'claude', { x: 1600, y: 1200 });
    const a = draft.agents.find((x) => x.id === id)!;
    expect(a.group_id).toBe(gid);
    // The first free slot of the empty group, not the drop point: the box grows at most by the
    // grid rounding of that slot, never out to where the pointer was released.
    expect([a.x, a.y]).toEqual([g.x + 24, g.y + 28 + 24]);
    const after = draft.groups.find((x) => x.id === gid)!;
    expect([after.x, after.y, after.w]).toEqual([g.x, g.y, g.w]);
    expect(after.h).toBeLessThanOrEqual(g.h + GRID);
    expect(inside(a, after)).toBe(true);
    expect(violations(draft)).toEqual([]);
  });

  it('adding a second agent outside every group takes the next free slot, not the same one', () => {
    const { draft: grouped, id: gid } = addGroup(withMain(teamDraft()));
    const one = addAgent(grouped, 'claude', { x: 1600, y: 1200 });
    const two = addAgent(one.draft, 'claude', { x: 1600, y: 1200 });
    const a = two.draft.agents.find((x) => x.id === one.id)!;
    const b = two.draft.agents.find((x) => x.id === two.id)!;
    expect(b.group_id).toBe(gid);
    expect(overlaps(agentBox(a), agentBox(b))).toBe(false);
    expect(violations(two.draft)).toEqual([]);
  });

  it('dropping an existing card on empty space keeps it in its own group (nearest group is only for adding)', () => {
    const { draft, id } = addGroup(withMain(teamDraft()));
    const g = draft.groups.find((x) => x.id === id)!;
    // The drop point is far below the new group, nearer to it than to the main group.
    const { draft: moved, reason } = moveAgent(draft, 'reviewer', { x: g.x + 40, y: g.y + g.h + 400 });
    expect(reason).toBeUndefined();
    expect(moved.agents[1].group_id).toBe(DEFAULT_GROUP_ID);
    expect(inside(moved.agents[1], moved.groups.find((x) => x.id === DEFAULT_GROUP_ID)!)).toBe(true);
    expect(violations(moved)).toEqual([]);
  });

  it('with the team running, a drop on empty space keeps the card in its own group', () => {
    const { draft, id } = addGroup(withMain(teamDraft()));
    const g = draft.groups.find((x) => x.id === id)!;
    const { draft: moved, reason } = moveAgent(draft, 'reviewer', { x: g.x + 40, y: g.y + g.h + 400 }, true);
    expect(reason).toBeUndefined();
    expect(moved.agents[1].group_id).toBe(DEFAULT_GROUP_ID);
    expect(inside(moved.agents[1], moved.groups.find((x) => x.id === DEFAULT_GROUP_ID)!)).toBe(true);
    expect(violations(moved)).toEqual([]);
  });

  it('moveGroup stops at a neighbour instead of covering it, and keeps cards on the grid', () => {
    const { draft, id } = addGroup(withMain(teamDraft()));
    const main = draft.groups[0];
    const moved = moveGroup(draft, DEFAULT_GROUP_ID, 2000, 0);
    const m = moved.groups[0];
    const other = moved.groups.find((g) => g.id === id)!;
    expect(m.x).toBeGreaterThan(main.x);
    expect(m.x + m.w).toBeLessThanOrEqual(other.x);
    expect(violations(moved)).toEqual([]);
  });

  it('moveGroup never leaves the canvas and keeps cards on the grid when clamped', () => {
    const d = teamDraft({
      groups: [grp('team', 16, 44, 248, 276), grp('g2', 600, 0)],
      agents: [draftAgent('builder', { x: 40, y: 96, group_id: 'team' }), draftAgent('reviewer', { x: 624, y: 56, group_id: 'g2' })],
    });
    expect(violations(d)).toEqual([]);
    const moved = moveGroup(d, 'team', -1000, -1000);
    expect(moved.groups[0].x).toBeGreaterThanOrEqual(0);
    expect(moved.groups[0].y).toBeGreaterThanOrEqual(0);
    expect(moved.agents[0].x % GRID).toBe(0);
    expect(moved.agents[0].y % GRID).toBe(0);
    expect(violations(moved)).toEqual([]);
  });

  it('moveToGroup into a full column grows the group downward and pushes the group below', () => {
    const d = teamDraft({
      groups: [grp('team', 16, 0, 248, 264), grp('g2', 16, 300)],
      agents: [draftAgent('builder', { x: 40, y: 40, group_id: 'team' }), draftAgent('reviewer', { x: 40, y: 352, group_id: 'g2' })],
    });
    expect(violations(d)).toEqual([]);
    const second = { ...draftAgent('extra', { x: 40, y: 352, group_id: 'g2' }) };
    const withExtra = { ...d, agents: [...d.agents, second] };
    const moved = moveToGroup(withExtra, 'extra', 'team');
    expect(moved.agents[2].group_id).toBe('team');
    expect(violations(moved)).toEqual([]);
  });

  it('a randomized sequence of edits keeps every invariant', () => {
    for (let run = 0; run < 240; run++) {
      // Even runs start with agents outside every group; odd runs as a team with the main group drawn.
      const seed = Math.floor(run / 2) + 1;
      const legacy = run % 2 === 1;
      const rnd = mulberry32(seed);
      const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
      const pt = () => ({ x: Math.floor(rnd() * 1800) - 100, y: Math.floor(rnd() * 1400) - 100 });
      // The fixture's Reviewer sits at x 300, off the 8 px grid; edits only ever produce grid positions.
      const start = teamDraft({ agents: [draftAgent('builder', { x: 40, y: 40 }), draftAgent('reviewer', { x: 304, y: 40 })] });
      let d = legacy ? addGroup(withMain(start)).draft : start;
      expect([violations(d), offGrid(d)]).toEqual([[], []]);
      for (let step = 0; step < 30; step++) {
        const r = rnd();
        let op: string;
        if (r < 0.2) {
          op = 'addAgent';
          d = addAgent(d, pick(['claude', 'codex'] as const), pt()).draft;
        } else if (r < 0.45 && d.agents.length > 0) {
          op = 'moveAgent';
          d = moveAgent(d, pick(d.agents).id, pt(), rnd() < 0.3).draft;
        } else if (r < 0.6 && d.groups.length > 0) {
          op = 'moveGroup';
          d = moveGroup(d, pick(d.groups).id, Math.floor(rnd() * 900) - 450, Math.floor(rnd() * 900) - 450);
        } else if (r < 0.75 && d.groups.length > 0 && d.agents.length > 0) {
          op = 'moveToGroup';
          d = moveToGroup(d, pick(d.agents).id, pick(d.groups).id);
        } else if (r < 0.88 && d.groups.length < 6) {
          op = 'addGroup';
          d = addGroup(d).draft;
        } else if (d.groups.length > 0) {
          op = 'removeGroup';
          d = removeElement(d, { kind: 'group', id: pick(d.groups).id }).draft;
        } else {
          op = 'none';
        }
        expect([violations(d), offGrid(d)], `seed ${seed}${legacy ? ' (main group)' : ''}, step ${step}, after ${op}`).toEqual([[], []]);
      }
    }
  });
});

describe('fitGroups', () => {
  it('grows a group to contain its agents, counting agents without a group as members of the main group', () => {
    const d = teamDraft({
      groups: [grp('team', 0, 0, 100, 100), grp('g2', 1200, 0)],
      agents: [draftAgent('builder', { x: 40, y: 40, group_id: 'team' }), draftAgent('reviewer', { x: 300, y: 40, group_id: null })],
    });
    const fitted = fitGroups(d);
    expect(fitted.groups[0]).toMatchObject({ x: 0, y: 0, w: 300 + CARD_W + 24, h: 40 + CARD_H + 24 });
    expect(fitted.groups[1]).toBe(d.groups[1]);
  });

  it('never shrinks a group, and returns the same draft when nothing grows', () => {
    const d = teamDraft({ groups: [grp('team', 0, 0, 900, 900), grp('g2', 1200, 0)], agents: [draftAgent('builder', { x: 40, y: 40 })] });
    expect(fitGroups(d)).toBe(d);
  });
});

describe('membership is null-aware', () => {
  const d = () =>
    teamDraft({
      groups: [grp('team', 16, 0, 512, 276), grp('g2', 600, 0)],
      agents: [draftAgent('builder', { x: 40, y: 48, group_id: null }), draftAgent('reviewer', { x: 304, y: 48, group_id: 'team' })],
    });

  it('moveGroup moves agents without a group with the main group', () => {
    const moved = moveGroup(d(), 'team', 0, 64);
    expect(moved.agents.map((a) => a.y)).toEqual([112, 112]);
  });

  it('moveToGroup does not stack a card on a member without a group', () => {
    const base = d();
    const withExtra = { ...base, agents: [...base.agents, draftAgent('extra', { x: 624, y: 56, group_id: 'g2' })] };
    const moved = moveToGroup(withExtra, 'extra', 'team');
    const extra = moved.agents[2];
    expect(overlaps(agentBox(extra), agentBox(moved.agents[0]))).toBe(false);
    expect(violations(moved)).toEqual([]);
  });

  it('deletes implicit group members along with their group', () => {
    const result=removeElement(d(), { kind: 'group', id: 'team' });
    expect(result.reason).toBeUndefined();
    expect(result.draft.agents).toHaveLength(0);
    expect(result.draft.connections).toHaveLength(0);
  });
});

describe('deleting', () => {
  it('deleting an agent removes the agent and connections at either end, and keeps the rest', () => {
    const base = teamDraft();
    const d: TeamDraft = {
      ...base,
      agents: [...base.agents, draftAgent('tester', { x: 560 })],
      connections: [
        { id: 'c1', from: 'builder', to: 'reviewer', kind: 'hands-work-to' },
        { id: 'c2', from: 'reviewer', to: 'builder', kind: 'reports-to' },
        { id: 'c3', from: 'reviewer', to: 'tester', kind: 'hands-work-to' },
      ],
    };
    const { draft, reason } = removeElement(d, { kind: 'agent', id: 'builder' });
    expect(reason).toBeUndefined();
    expect(draft.agents.map((a) => a.id)).toEqual(['reviewer', 'tester']);
    expect(draft.connections.map((c) => c.id)).toEqual(['c3']);
  });

  it('deleting an empty group removes it and leaves the others alone', () => {
    const one = addGroup(withMain(teamDraft()));
    const two = addGroup(one.draft);
    const { draft, reason } = removeElement(two.draft, { kind: 'group', id: two.id });
    expect(reason).toBeUndefined();
    expect(draft.groups.map((g) => g.id)).toEqual([DEFAULT_GROUP_ID, one.id]);
    expect(draft.groups).toEqual(one.draft.groups);
  });

  it('when only the main group is left it becomes implicit again, and no seat id changes', () => {
    const before = teamDraft();
    const { draft: grouped, id } = addGroup(before);
    const { draft } = removeElement(grouped, { kind: 'group', id });
    expect(draft.groups).toEqual([]);
    expect(draft.agents.every((a) => a.group_id === null)).toBe(true);
    expect(drawnGroups(draft)).toEqual([]);
    for (const a of before.agents) expect(seatIdFor(draft, a.id)).toBe(seatIdFor(before, a.id));
  });

  it('a single remaining group that is not the main group stays drawn', () => {
    const { draft: grouped, id } = addGroup(withMain(teamDraft()));
    const moved = moveToGroup(moveToGroup(grouped, 'builder', id), 'reviewer', id);
    const { draft } = removeElement(moved, { kind: 'group', id: DEFAULT_GROUP_ID });
    expect(draft.groups.map((g) => g.id)).toEqual([id]);
    expect(drawnGroups(draft).map((g) => g.id)).toEqual([id]);
    expect(Object.keys(draftLayout(draft).pods)).toEqual([id]);
  });
});

describe('push direction', () => {
  it('a growing group pushes a neighbour on its left further left when there is room', () => {
    const d = teamDraft({
      groups: [grp('left', 200, 0), grp('anchor', 480, 0)],
      agents: [draftAgent('builder', { x: 224, y: 56, group_id: 'left' }), draftAgent('reviewer', { x: 504, y: 56, group_id: 'anchor' })],
    });
    expect(violations(d)).toEqual([]);
    const { draft } = moveAgent(d, 'reviewer', { x: 440, y: 56 });
    const left = draft.groups.find((g) => g.id === 'left')!;
    const anchor = draft.groups.find((g) => g.id === 'anchor')!;
    expect(anchor.x).toBe(416);
    expect(left.x).toBe(152);
    expect(left.y).toBe(0);
    expect(draft.agents[0]).toMatchObject({ x: 176, y: 56 });
    expect(violations(draft)).toEqual([]);
  });

  it('pushes a neighbour above further up when there is room', () => {
    const d = teamDraft({
      groups: [grp('top', 0, 200), grp('anchor', 0, 500)],
      agents: [draftAgent('builder', { x: 24, y: 252, group_id: 'top' }), draftAgent('reviewer', { x: 24, y: 552, group_id: 'anchor' })],
    });
    expect(violations(d)).toEqual([]);
    const { draft } = moveAgent(d, 'reviewer', { x: 24, y: 496 });
    const top = draft.groups.find((g) => g.id === 'top')!;
    const anchor = draft.groups.find((g) => g.id === 'anchor')!;
    expect(anchor.y).toBe(444);
    expect(top.x).toBe(0);
    expect(top.y + top.h + 16).toBeLessThanOrEqual(anchor.y);
    expect(top.y).toBeGreaterThanOrEqual(0);
    expect(violations(draft)).toEqual([]);
  });

  it('falls back to right or down when there is no room on the left or above', () => {
    const d = teamDraft({
      groups: [grp('left', 8, 0), grp('anchor', 280, 0)],
      agents: [draftAgent('builder', { x: 32, y: 56, group_id: 'left' }), draftAgent('reviewer', { x: 304, y: 56, group_id: 'anchor' })],
    });
    expect(violations(d)).toEqual([]);
    const { draft } = moveAgent(d, 'reviewer', { x: 240, y: 56 });
    const left = draft.groups.find((g) => g.id === 'left')!;
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(left.x > 8 || left.y > 0).toBe(true);
    expect(violations(draft)).toEqual([]);
  });
});

describe('a group an agent leaves', () => {
  it('shrinks to fit the agents that stay, so no empty space is left where the agent was', () => {
    const d = teamDraft({
      groups: [grp('team', 16, 0, 520, 560), grp('g2', 600, 0, 248, 560)],
      agents: [
        draftAgent('builder', { x: 40, y: 56, group_id: 'team' }),
        draftAgent('reviewer', { x: 296, y: 320, group_id: 'team' }),
        draftAgent('tester', { x: 624, y: 56, group_id: 'g2' }),
      ],
    });
    expect(violations(d)).toEqual([]);
    const moved = moveToGroup(d, 'reviewer', 'g2');
    const team = moved.groups.find((g) => g.id === 'team')!;
    expect(team).toMatchObject({ x: 16, y: 4, w: 248, h: 276 });
    expect(violations(moved)).toEqual([]);
    const dragged = moveAgent(d, 'reviewer', { x: 624, y: 320 }).draft;
    expect(dragged.agents[1].group_id).toBe('g2');
    expect(dragged.groups.find((g) => g.id === 'team')).toMatchObject({ w: 248, h: 276 });
    expect(violations(dragged)).toEqual([]);
  });
});

describe('folding the main group', () => {
  it('a lone main group with a label you changed stays drawn, with its label', () => {
    const { draft: grouped, id } = addGroup(withMain(teamDraft()));
    const renamed = renameGroup(grouped, DEFAULT_GROUP_ID, 'Core');
    const { draft } = removeElement(renamed, { kind: 'group', id });
    expect(draft.groups).toHaveLength(1);
    expect(draft.groups[0]).toMatchObject({ id: DEFAULT_GROUP_ID, label: 'Core' });
    expect(drawnGroups(draft).map((g) => g.label)).toEqual(['Core']);
    expect(draft.agents.every((a) => a.group_id === DEFAULT_GROUP_ID)).toBe(true);
    for (const a of grouped.agents) expect(seatIdFor(draft, a.id)).toBe(seatIdFor(grouped, a.id));
  });

  it('a lone main group with its default label folds away', () => {
    const { draft: grouped, id } = addGroup(withMain(teamDraft()));
    const { draft } = removeElement(grouped, { kind: 'group', id });
    expect(draft.groups).toEqual([]);
    expect(drawnGroups(draft)).toEqual([]);
  });
});

describe('connections', () => {
  it('connect refuses agents that are not on the team', () => {
    const d = teamDraft();
    const r = connect(d, 'builder', 'ghost');
    expect(r).toEqual({ draft: d, id: null, reason: 'Both agents must be on this team.' });
    expect(connect(d, 'ghost', 'builder').reason).toBe('Both agents must be on this team.');
  });

  it('changing a connection’s type refuses to duplicate another connection', () => {
    const base = teamDraft();
    const d: TeamDraft = { ...base, connections: [...base.connections, { id: 'c2', from: 'builder', to: 'reviewer', kind: 'watches' }] };
    const r = setConnectionKind(d, 'c2', 'hands-work-to');
    expect(r.draft).toBe(d);
    expect(r.reason).toBe('Builder already hands work to Reviewer.');
    expect(setConnectionKind(d, 'c2', 'reports-to').draft.connections[1].kind).toBe('reports-to');
    expect(setConnectionKind(d, 'c1', 'hands-work-to').reason).toBeUndefined();
  });
});

describe('edits never mutate their input', () => {
  it('every edit leaves a deep-frozen draft untouched', () => {
    const plain = deepFreeze(teamDraft());
    const grouped = deepFreeze(addGroup(withMain(teamDraft())).draft);
    const gid = grouped.groups[1].id;
    const edits: (() => unknown)[] = [
      () => addAgent(plain, 'claude', { x: 600, y: 300 }),
      () => addAgent(grouped, 'claude', { x: 1600, y: 1200 }),
      () => moveAgent(plain, 'builder', { x: 99, y: 99 }),
      () => moveAgent(grouped, 'builder', { x: 60, y: 100 }),
      () => moveAgent(grouped, 'reviewer', { x: 2000, y: 2000 }, true),
      () => moveGroup(grouped, DEFAULT_GROUP_ID, 2000, 64),
      () => moveToGroup(grouped, 'builder', gid),
      () => removeElement(plain, { kind: 'agent', id: 'builder' }),
      () => removeElement(grouped, { kind: 'group', id: gid }),
      () => connect(plain, 'reviewer', 'builder'),
      () => setConnectionKind(plain, 'c1', 'watches'),
      () => addGroup(plain),
      () => addGroup(grouped),
      () => fitGroups(grouped),
      () => renameTeam(plain, 'x'),
      () => renameAgent(plain, 'builder', 'x'),
      () => setJob(plain, 'builder', 'x'),
      () => setFolder(plain, 'builder', '/x'),
      () => setAdvanced(plain, 'builder', { permission: 'restricted' }),
      () => renameGroup(grouped, gid, 'x'),
    ];
    for (const e of edits) expect(e).not.toThrow();
    expect(plain).toEqual(teamDraft());
  });
});

describe('small edits and geometry', () => {
  it('renameGroup changes only that group’s label', () => {
    const { draft, id } = addGroup(withMain(teamDraft()));
    const renamed = renameGroup(draft, id, 'Reviewers');
    expect(renamed.groups.find((g) => g.id === id)!.label).toBe('Reviewers');
    expect(renamed.groups[0]).toBe(draft.groups[0]);
  });

  it('connectionPath joins facing edges, sideways and vertically', () => {
    const box = (x: number, y: number) => ({ x, y, w: 200, h: 200 });
    expect(connectionPath(box(0, 0), box(300, 0))).toEqual({ d: 'M200,100 L300,100', mid: { x: 250, y: 100 } });
    expect(connectionPath(box(300, 0), box(0, 0))).toEqual({ d: 'M300,100 L200,100', mid: { x: 250, y: 100 } });
    expect(connectionPath(box(0, 0), box(0, 300))).toEqual({ d: 'M100,200 L100,300', mid: { x: 100, y: 250 } });
    expect(connectionPath(box(0, 300), box(0, 0))).toEqual({ d: 'M100,300 L100,200', mid: { x: 100, y: 250 } });
  });

  it('canvasSize is at least 960 × 640 and leaves room past the furthest card', () => {
    expect(canvasSize(teamDraft({ agents: [], connections: [] }))).toEqual({ width: 960, height: 640 });
    expect(canvasSize(teamDraft({ agents: [draftAgent('far', { x: 1000, y: 800 })], connections: [] }))).toEqual({
      width: 1000 + CARD_W + 400,
      height: 800 + CARD_H + 400,
    });
  });

  it('keyboard placement slots stay on the 8px grid', () => {
    expect(COL % GRID).toBe(0);
    let d = teamDraft({ agents: [], connections: [] });
    for (let i = 0; i < 8; i++) {
      const p = nextFreeSlot(d);
      expect([p.x % GRID, p.y % GRID]).toEqual([0, 0]);
      d = { ...d, agents: [...d.agents, draftAgent(`a${i}`, p)] };
    }
  });
});

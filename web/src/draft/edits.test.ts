import { describe, expect, it } from 'vitest';
import { teamDraft } from '../test-fixtures';
import {
  addAgent,
  addGroup,
  connect,
  moveAgent,
  moveGroup,
  moveToGroup,
  removeElement,
  renameAgent,
  selectionExists,
  setAdvanced,
  setConnectionKind,
  setFolder,
  setJob,
} from './edits';
import { agentAt, canvasSize, draftLayout, drawnGroups, nextFreeSlot, snap } from './geometry';
import { DEFAULT_GROUP_ID, nameMap, nextAgentName, seatIdFor, slug } from './ids';

describe('ids', () => {
  it('slugs names and picks the next free default name', () => {
    expect(slug('Claude 1', 'agent')).toBe('claude-1');
    expect(slug('  ', 'agent')).toBe('agent');
    expect(nextAgentName(teamDraft(), 'claude')).toBe('Claude 1');
    const base = teamDraft();
    const d = { ...base, agents: [...base.agents, { ...base.agents[0], id: 'x', name: 'claude 1' }] };
    expect(nextAgentName(d, 'claude')).toBe('Claude 2');
    expect(nextAgentName(d, 'practice')).toBe('Practice 1');
  });

  it('derives seat ids and names from immutable ids', () => {
    const d = teamDraft();
    expect(DEFAULT_GROUP_ID).toBe('team');
    expect(seatIdFor(d, 'builder')).toBe('team.builder@t');
    expect(seatIdFor(d, 'nobody')).toBeNull();
    expect(nameMap(d)).toEqual({ 'team.builder@t': 'Builder', 'team.reviewer@t': 'Reviewer' });
  });
});

describe('edits', () => {
  it('adds an agent with a default name, an id from it and a snapped position', () => {
    const { draft, id } = addAgent(teamDraft(), 'claude', { x: 301, y: 283 });
    const a = draft.agents.find((x) => x.id === id)!;
    expect(a.name).toBe('Claude 1');
    expect(id).toMatch(/^claude-1-[0-9a-z]{4}$/);
    expect([a.x, a.y]).toEqual([304, 280]);
    expect(a.group_id).toBeNull();
    expect(a.advanced).toEqual({ model: null, permission: 'unrestricted', resume: 'resume-if-possible' });
  });

  it('moves on the grid and never below zero', () => {
    expect(moveAgent(teamDraft(), 'builder', { x: -50, y: 13 }).draft.agents[0]).toMatchObject({ x: 0, y: 16 });
  });

  it('deleting an agent or a whole group removes its agents and connections', () => {
    expect(removeElement(teamDraft(), { kind: 'agent', id: 'builder' }).draft.connections).toEqual([]);
    expect(removeElement(teamDraft(), { kind: 'connection', id: 'c1' }).draft.connections).toEqual([]);
    const grouped = addGroup(teamDraft()).draft;
    const r = removeElement(grouped, { kind: 'group', id: DEFAULT_GROUP_ID });
    expect(r.reason).toBeUndefined();
    expect(r.draft.agents).toHaveLength(0);
    expect(r.draft.connections).toHaveLength(0);
    expect(grouped.agents).toHaveLength(2);
  });

  it('refuses self and duplicate connections with a reason', () => {
    expect(connect(teamDraft(), 'builder', 'builder').reason).toBe('An agent cannot hand work to itself.');
    expect(connect(teamDraft(), 'builder', 'reviewer').reason).toBe('Builder already hands work to Reviewer.');
    const r = connect(teamDraft(), 'reviewer', 'builder');
    expect(r.draft.connections.at(-1)).toMatchObject({ id: r.id, from: 'reviewer', to: 'builder', kind: 'hands-work-to' });
    expect(setConnectionKind(r.draft, r.id!, 'watches').draft.connections.at(-1)!.kind).toBe('watches');
  });

  it('the first + Group turns the implicit group into Main group and keeps seat ids', () => {
    const before = teamDraft();
    const { draft, id } = addGroup(before);
    expect(draft.groups.map((g) => g.label)).toEqual(['Main group', 'Group 2']);
    expect(draft.groups[0].id).toBe(DEFAULT_GROUP_ID);
    expect(draft.agents.every((a) => a.group_id === DEFAULT_GROUP_ID)).toBe(true);
    expect(seatIdFor(draft, 'builder')).toBe(seatIdFor(before, 'builder'));
    expect(drawnGroups(draft)).toHaveLength(2);
    const main = draft.groups[0];
    expect(draft.groups.find((g) => g.id === id)!.x).toBeGreaterThanOrEqual(main.x + main.w);
  });

  it('moves an agent into a group inside its box, and a group with its agents', () => {
    const { draft, id } = addGroup(teamDraft());
    const moved = moveToGroup(draft, 'builder', id);
    const g = moved.groups.find((x) => x.id === id)!;
    const a = moved.agents[0];
    expect(a.group_id).toBe(id);
    expect(a.x).toBeGreaterThanOrEqual(g.x);
    expect(a.y).toBeGreaterThanOrEqual(g.y);
    expect(a.x + 200).toBeLessThanOrEqual(g.x + g.w);
    const shifted = moveGroup(moved, id, 32, 16);
    expect(shifted.agents[0]).toMatchObject({ x: a.x + 32, y: a.y + 16 });
    expect(shifted.groups.find((x) => x.id === id)).toMatchObject({ x: g.x + 32, y: g.y + 16 });
  });

  it('dragging an agent onto a drawn group joins it', () => {
    const { draft, id } = addGroup(teamDraft());
    const g = draft.groups.find((x) => x.id === id)!;
    expect(moveAgent(draft, 'reviewer', { x: g.x + 24, y: g.y + 52 }).draft.agents[1].group_id).toBe(id);
  });

  it('a move that must keep its group (team running) refuses a drop on another group and snaps back', () => {
    const { draft, id } = addGroup(teamDraft());
    const g = draft.groups.find((x) => x.id === id)!;
    const r = moveAgent(draft, 'reviewer', { x: g.x + 24, y: g.y + 52 }, true);
    expect(r.draft).toBe(draft);
    expect(r.reason).toBe("An agent can't change group while the team is running.");
  });

  it('a move that must keep its group (team running) still moves the card within its own group', () => {
    const { draft } = addGroup(teamDraft());
    const r = moveAgent(draft, 'reviewer', { x: 304, y: 64 }, true);
    expect(r.reason).toBeUndefined();
    expect(r.draft.agents[1]).toMatchObject({ x: 304, y: 64, group_id: 'team' });
  });

  it('sets fields and forgets selections of removed elements', () => {
    let d = renameAgent(teamDraft(), 'builder', 'Lead');
    d = setJob(d, 'builder', 'Do it');
    d = setFolder(d, 'builder', '/home/u/repo');
    d = setAdvanced(d, 'builder', { permission: 'restricted' });
    expect(d.agents[0]).toMatchObject({ name: 'Lead', job: 'Do it', folder: '/home/u/repo' });
    expect(d.agents[0].advanced).toEqual({ model: null, permission: 'restricted', resume: 'resume-if-possible' });
    expect(selectionExists(d, { kind: 'agent', id: 'builder' })).toEqual({ kind: 'agent', id: 'builder' });
    expect(selectionExists(d, { kind: 'agent', id: 'gone' })).toBeNull();
  });
});

describe('geometry', () => {
  it('finds the next free slot and the agent under a point', () => {
    expect(nextFreeSlot(teamDraft())).toEqual({ x: 568, y: 40 });
    expect(agentAt(teamDraft(), { x: 350, y: 100 })).toBe('reviewer');
    expect(agentAt(teamDraft(), { x: 270, y: 100 })).toBeNull();
    expect(snap(12)).toBe(16);
  });

  it('lays Run mode out from the same positions', () => {
    const l = draftLayout(teamDraft());
    expect(l.seats['team.builder@t']).toEqual({ x: 40, y: 40, w: 200, h: 200 });
    expect(l.seats['team.reviewer@t'].x).toBe(300);
    expect(l.pods).toEqual({});
    expect(l.width).toBe(540);
    expect(canvasSize(teamDraft()).width).toBeGreaterThanOrEqual(960);
  });
});

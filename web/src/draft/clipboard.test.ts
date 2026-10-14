import { beforeEach, describe, expect, it } from 'vitest';
import { teamDraft } from '../test-fixtures';
import { copyName, copyOf, pasteClip, readClip, writeClip } from './clipboard';
import { addGroup, moveToGroup } from './edits';

/** Builder and Reviewer (Builder hands work to Reviewer), both in one new group, with folders. */
function grouped() {
  const { draft, id } = addGroup(teamDraft());
  const d = moveToGroup(moveToGroup(draft, 'builder', id), 'reviewer', id);
  return { d: { ...d, agents: d.agents.map((a) => ({ ...a, folder: `/work/${a.id}` })) }, id };
}

describe('board copy and paste', () => {
  beforeEach(() => localStorage.clear());

  it('pastes an agent beside the original, in its group, with a fresh id and name, its settings and no arrows', () => {
    const { d, id } = grouped();
    const clip = copyOf(d, { kind: 'agent', id: 'builder' })!;
    const r = pasteClip(d, clip);
    const copy = r.draft.agents.at(-1)!;
    expect(r.select).toEqual({ kind: 'agent', id: copy.id });
    expect(copy).toMatchObject({ name: 'Builder 2', group_id: id, folder: '/work/builder', job: d.agents[0].job, kind: d.agents[0].kind });
    expect(copy.id).not.toBe('builder');
    expect(r.draft.connections).toEqual(d.connections);
    expect(r.draft.agents.slice(0, 2)).toEqual(d.agents.slice(0, 2).map((a) => expect.objectContaining({ id: a.id, name: a.name })));
  });

  it('pastes a group with its agents and the arrow between them, all new, and leaves the original alone', () => {
    const { d, id } = grouped();
    const r = pasteClip(d, copyOf(d, { kind: 'group', id })!);
    expect(r.select?.kind).toBe('group');
    const g = r.draft.groups.find((x) => x.id === r.select!.id)!;
    expect(g.label).toBe('Group 2');
    const members = r.draft.agents.filter((a) => a.group_id === g.id);
    expect(members.map((a) => a.folder)).toEqual(['/work/builder', '/work/reviewer']);
    expect(new Set(r.draft.agents.map((a) => a.name.toLowerCase())).size).toBe(4);
    const arrow = r.draft.connections.at(-1)!;
    expect([arrow.from, arrow.to]).toEqual(members.map((a) => a.id));
    expect(r.draft.connections).toHaveLength(2);
    const old = r.draft.groups.find((x) => x.id === id)!;
    expect(g.x >= old.x + old.w || g.y >= old.y + old.h).toBe(true);
  });

  it('pastes an agent into a chosen group, or at a board point outside every group', () => {
    const plain = teamDraft();
    const { draft, id } = addGroup(plain);
    const clip = copyOf(draft, { kind: 'agent', id: 'reviewer' })!;
    expect(pasteClip(draft, clip, { into: id }).draft.agents.at(-1)!.group_id).toBe(id);
    const loose = pasteClip(draft, clip, { at: { x: 40, y: 900 } }).draft.agents.at(-1)!;
    expect(loose).toMatchObject({ x: 40, y: 900, group_id: null });
  });

  it('keeps the clip for other tabs and teams, and ignores anything else in storage', () => {
    const { d } = grouped();
    writeClip(copyOf(d, { kind: 'agent', id: 'builder' })!);
    expect(readClip()).toMatchObject({ kind: 'agent', agent: { id: 'builder' } });
    localStorage.setItem('sculptured.board-clipboard', '{"kind":"agent"}');
    expect(readClip()).toMatchObject({ kind: 'agent', agent: { id: 'builder' } });
    expect(copyOf(d, { kind: 'connection', id: 'c1' })).toBeNull();
  });

  it('names copies with the next free number', () => {
    const d = teamDraft();
    expect(copyName('Builder', d)).toBe('Builder 2');
    expect(copyName('Somebody new', d)).toBe('Somebody new');
    const two = { ...d, agents: [...d.agents, { ...d.agents[0], id: 'b2', name: 'Builder 2' }] };
    expect(copyName('Builder', two)).toBe('Builder 3');
    expect(copyName('Builder 2', two)).toBe('Builder 3');
  });
});

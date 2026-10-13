import { expect, it } from 'vitest';
import { fullTextLayout } from './fullText';
import { draftAgent, teamDraft } from '../test-fixtures';

it('pushes cards below a taller card down by its extra height, keeping the gap, and leaves other columns alone', () => {
  const d = teamDraft({ connections: [], groups: [{ id: 'g', label: 'G', x: -20, y: 220, w: 240, h: 240 }], agents: [
    draftAgent('a', { x: 0, y: 0 }), draftAgent('b', { x: 0, y: 240, group_id: 'g' }), draftAgent('c', { x: 400, y: 240 }),
  ] });
  const out = fullTextLayout(d, { a: 400, b: 300, c: 200 });
  const y = (id: string) => out.agents.find((x) => x.id === id)!.y;
  expect([y('a'), y('b'), y('c')]).toEqual([0, 440, 240]);
  const g = out.groups[0];
  expect(g.y).toBe(420);
  expect(g.y + g.h).toBeGreaterThanOrEqual(440 + 300);
  expect(d.agents[1].y, 'the saved draft is untouched').toBe(240);
});

it('changes nothing when every card keeps its normal height', () => {
  const d = teamDraft({ connections: [], agents: [draftAgent('a', { x: 0, y: 0 }), draftAgent('b', { x: 0, y: 240 })] });
  expect(fullTextLayout(d, {}).agents.map((a) => a.y)).toEqual([0, 240]);
});

it('moves a group below a grown group down, members and all, so frames never overlap', () => {
  const d = teamDraft({ connections: [], groups: [
    { id: 'top', label: 'Top', x: -20, y: -20, w: 480, h: 240 },
    { id: 'low', label: 'Low', x: 200, y: 260, w: 240, h: 240 },
  ], agents: [
    draftAgent('a', { x: 0, y: 0, group_id: 'top' }), draftAgent('b', { x: 220, y: 280, group_id: 'low' }),
  ] });
  const out = fullTextLayout(d, { a: 600 });
  const top = out.groups[0], low = out.groups[1];
  expect(low.y).toBeGreaterThanOrEqual(top.y + top.h);
  expect(out.agents[1].y - low.y).toBe(280 - 260);
});

import { describe, expect, it } from 'vitest';
import { draftAgent, teamDraft } from '../test-fixtures';
import { focusSet, isQuiet, QUIET_AFTER } from './arrowFocus';

const d = teamDraft({
  groups: [{ id: 'g', label: 'Build', x: 0, y: 0, w: 500, h: 300, models: { claude: null, codex: null } }],
  agents: [draftAgent('a', { group_id: 'g' }), draftAgent('b', { group_id: 'g' }), draftAgent('c')],
  connections: [],
});

describe('arrow focus', () => {
  it('an agent lights up itself and its group, so arrows to the group light up too', () => {
    expect([...focusSet(d, 'a')].sort()).toEqual(['a', 'g']);
  });

  it('a group lights up itself and every member', () => {
    expect([...focusSet(d, 'g')].sort()).toEqual(['a', 'b', 'g']);
  });

  it('nothing focused lights up nothing', () => {
    expect(focusSet(d, null).size).toBe(0);
  });

  it('a board goes quiet past QUIET_AFTER arrows unless every arrow is asked for', () => {
    const many = { ...d, connections: Array.from({ length: QUIET_AFTER + 1 }, (_, i) => ({ id: `c${i}`, from: 'a', to: 'c', kind: 'reports-to' as const })) };
    expect(isQuiet(many, false)).toBe(true);
    expect(isQuiet(many, true)).toBe(false);
    expect(isQuiet(d, false)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { TeamDraft } from '../../generated/TeamDraft';
import { teamDraft } from '../../test-fixtures';
import { compareDesigns, markClass } from './compare';

function base(): TeamDraft {
  const d = teamDraft({ id: 't', name: 'Pair' });
  return {
    ...d,
    groups: [{ id: 'g', label: 'Build', x: 0, y: 0, w: 600, h: 300, models: { claude: null, codex: null } }],
    agents: [
      { id: 'a', group_id: 'g', name: 'Alpha', kind: 'claude', job: 'plan', folder: null, x: 40, y: 40, advanced: { model: null, permission: 'unrestricted', resume: 'resume-if-possible' } },
      { id: 'b', group_id: 'g', name: 'Beta', kind: 'claude', job: 'build', folder: null, x: 300, y: 40, advanced: { model: null, permission: 'unrestricted', resume: 'resume-if-possible' } },
    ],
    connections: [{ id: 'c1', from: 'a', to: 'b', kind: 'hands-work-to' }],
  };
}

describe('comparing a proposal with the saved design', () => {
  it('marks what is new, changed and removed, and draws removed parts so they can be seen', () => {
    const before = base();
    const after: TeamDraft = {
      ...before,
      agents: [
        { ...before.agents[0], job: 'Plan the work in numbered steps.', advanced: { ...before.agents[0].advanced, model: 'opus' } },
        { id: 'qa', group_id: null, name: 'QA', kind: 'codex', job: 'test', folder: null, x: 600, y: 40, advanced: { model: null, permission: 'unrestricted', resume: 'resume-if-possible' } },
      ],
      connections: [{ id: 'c2', from: 'a', to: 'qa', kind: 'hands-work-to' }],
    };
    const c = compareDesigns(before, after);
    expect(c.marks).toEqual({ a: 'changed', qa: 'added', b: 'removed', c1: 'removed', c2: 'added' });
    expect(c.shown.agents.map((x) => x.id)).toEqual(['a', 'qa', 'b']);
    expect(c.shown.connections.map((x) => x.id)).toEqual(['c2', 'c1']);
    const alpha = c.rows.find((r) => r.target?.id === 'a')!;
    expect(alpha.what).toBe('Alpha');
    expect(alpha.details).toEqual(['job', 'model: default → opus']);
    expect(alpha.before?.job).toBe('plan');
    expect(c.rows.map((r) => `${r.change} ${r.what}`)).toEqual(['changed Alpha', 'added QA', 'removed Beta', 'added Alpha → QA', 'removed Alpha → Beta']);
  });

  it('reports nothing when the proposal is the design', () => {
    const c = compareDesigns(base(), base());
    expect(c.rows).toEqual([]);
    expect(c.marks).toEqual({});
  });

  it('matches an arrow the assistant re-made under a new id by its ends', () => {
    const before = base();
    const after = { ...before, connections: [{ id: 'a-handoff-b', from: 'a', to: 'b', kind: 'hands-work-to' as const }] };
    expect(compareDesigns(before, after).rows).toEqual([]);
  });

  it('turns a mark into a class', () => {
    expect(markClass({ a: 'added' }, 'a')).toBe(' change-added');
    expect(markClass(undefined, 'a')).toBe('');
  });
});

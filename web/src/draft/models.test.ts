import { describe, expect, it } from 'vitest';
import type { TeamDraft } from '../generated/TeamDraft';
import { effectiveModel, notOnTeamModel, toTeamModels } from './models';

describe('agents with their own model', () => {
  it('lists the agents and groups the team model does not reach, and hands them back to it', () => {
    const d = {
      models: { claude: 'sonnet', codex: null },
      groups: [{ id: 'g', label: 'G', models: { claude: 'opus', codex: null } }],
      agents: [
        { id: 'a', name: 'Lead', kind: 'claude', group_id: null, advanced: { model: 'opus' } },
        { id: 'b', name: 'Dev', kind: 'claude', group_id: 'g', advanced: { model: null } },
        { id: 'c', name: 'Rev', kind: 'claude', group_id: null, advanced: { model: null } },
      ],
    } as unknown as TeamDraft;
    expect(notOnTeamModel(d).map((x) => [x.name, x.model])).toEqual([['Lead', 'opus'], ['Dev', 'opus']]);
    const cleared = toTeamModels(d);
    expect(cleared.agents.map((a) => effectiveModel(cleared, a).model)).toEqual(['sonnet', 'sonnet', 'sonnet']);
  });
});

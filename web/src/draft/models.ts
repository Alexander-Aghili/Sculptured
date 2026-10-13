import type { AgentKind } from '../generated/AgentKind';
import type { DraftAgent } from '../generated/DraftAgent';
import type { ModelDefaults } from '../generated/ModelDefaults';
import type { TeamDraft } from '../generated/TeamDraft';

/** The kinds that call a model; Practice agents never do. */
export type ModelKind = 'claude' | 'codex';

export const isModelKind = (k: AgentKind): k is ModelKind => k !== 'practice';

/** Where an agent's model comes from, for the "from team / from group" note. */
export type ModelSource = 'agent' | 'group' | 'team' | 'cli';

const clean = (m: string | null | undefined) => (m && m.trim() ? m.trim() : null);

const pick = (m: ModelDefaults | undefined, k: ModelKind) => clean(m?.[k]);

/** The model an agent runs with: its own, else its group's, else the team's, else the CLI's default. Mirrors `TeamDraft::effective_model`. */
export function effectiveModel(d: TeamDraft, a: DraftAgent): { model: string | null; source: ModelSource } {
  const own = clean(a.advanced.model);
  if (own) return { model: own, source: 'agent' };
  if (!isModelKind(a.kind)) return { model: null, source: 'cli' };
  const group = pick(d.groups.find((g) => g.id === a.group_id)?.models, a.kind);
  if (group) return { model: group, source: 'group' };
  const team = pick(d.models, a.kind);
  return team ? { model: team, source: 'team' } : { model: null, source: 'cli' };
}

/** Switches one agent to another kind. Its own model belonged to the old CLI, so it is cleared. */
export const setKind = (d: TeamDraft, id: string, kind: AgentKind): TeamDraft => ({
  ...d,
  agents: d.agents.map((a) => (a.id === id ? { ...a, kind, advanced: { ...a.advanced, model: null } } : a)),
});

/** Switches every agent in `ids` (default: all) to `kind`. */
export const setKindAll = (d: TeamDraft, kind: AgentKind, ids?: string[]): TeamDraft =>
  d.agents.filter((a) => !ids || ids.includes(a.id)).reduce((acc, a) => setKind(acc, a.id, kind), d);

const withModel = (m: ModelDefaults | undefined, k: ModelKind, model: string | null): ModelDefaults => ({
  claude: m?.claude ?? null,
  codex: m?.codex ?? null,
  [k]: clean(model),
});

export const setTeamModel = (d: TeamDraft, k: ModelKind, model: string | null): TeamDraft => ({
  ...d,
  models: withModel(d.models, k, model),
});

export const setGroupModel = (d: TeamDraft, groupId: string, k: ModelKind, model: string | null): TeamDraft => ({
  ...d,
  groups: d.groups.map((g) => (g.id === groupId ? { ...g, models: withModel(g.models, k, model) } : g)),
});

/** The default for agents in a group, before any agent override: the group's, else the team's. */
export const groupDefault = (d: TeamDraft, groupId: string | null, k: ModelKind): string | null =>
  pick(d.groups.find((g) => g.id === groupId)?.models, k) ?? pick(d.models, k);

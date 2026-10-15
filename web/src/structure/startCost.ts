import type { TeamDraft } from '../generated/TeamDraft';

/** From this many agents working at once, a Start says what it may cost. */
export const MANY_AT_ONCE = 6;

type Edge = { from: string; to: string };

/** Who can work at the same moment: the agents that start together, or the most one handoff starts. */
export function mostAtOnce(d: TeamDraft, handsTo: Edge[]): { n: number; why: string } {
  const ids = new Set(d.agents.map((a) => a.id));
  const name = (id: string) => d.agents.find((a) => a.id === id)?.name.trim() || 'an agent';
  const members = (id: string) => (ids.has(id) ? [id] : d.agents.filter((a) => a.group_id === id).map((a) => a.id));
  const heads = d.agents.filter((a) => !handsTo.some((c) => c.from !== c.to && members(c.to).includes(a.id)));
  let fan = { n: 0, from: '' };
  for (const a of d.agents) {
    const n = new Set(handsTo.filter((c) => c.from === a.id).flatMap((c) => members(c.to))).size;
    if (n > fan.n) fan = { n, from: a.id };
  }
  if (fan.n >= heads.length) return { n: fan.n, why: `${name(fan.from)} hands work to ${fan.n} at once` };
  return { n: heads.length, why: `${heads.length} agents start together` };
}

/** What a busy team may cost, said before it starts; nothing for a small team with limits. */
export function efficiencyNotes(d: TeamDraft, handsTo: Edge[]): string[] {
  const { n, why } = mostAtOnce(d, handsTo);
  if (n < MANY_AT_ONCE && d.agents.length < MANY_AT_ONCE) return [];
  const notes: string[] = [];
  if (n >= MANY_AT_ONCE) notes.push(`Up to ${n} agents can work at the same time: ${why}. Each uses your plan.`);
  if (!d.limits?.max_agents && !d.limits?.max_child_levels) notes.push('Agents can start helpers without limit. Set Most agents and Levels of children in Advanced.');
  if (!d.agents.some((a) => a.advanced.token_limit)) notes.push('No agent has a token limit.');
  return notes;
}

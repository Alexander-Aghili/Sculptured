import type { TeamDraft } from '../generated/TeamDraft';
import { CARD_W } from '../layout';
import { agentBox, clearOf, drawnGroups, MARGIN, snap, type Box, type Point } from './geometry';

/** The Input box's size on the board (as wide as a card, so it lines up with them). */
export const INPUT_W = CARD_W;
export const INPUT_H = 140;

/** The board can have an Input box: an ordinary project (a workflow has its own Input). */
export const inputAllowed = (d: TeamDraft) => !d.workflow;

export function teamInputBox(d: TeamDraft): Box | null {
  return d.input && inputAllowed(d) ? { x: d.input.x, y: d.input.y, w: INPUT_W, h: INPUT_H } : null;
}

/** Agents nobody hands work to: where the work starts, so where a new Input points. */
export function startingAgents(d: TeamDraft): string[] {
  const handed = new Set(d.connections.filter((c) => c.kind === 'hands-work-to' && c.from !== c.to).map((c) => c.to));
  return d.agents.filter((a) => !handed.has(a.id)).map((a) => a.id);
}

/**
 * Adds the Input at `at` (or the top left), moved clear of cards and groups. It points to the
 * agents where the work starts.
 */
export function addInput(d: TeamDraft, at?: Point): TeamDraft {
  if (d.input || !inputAllowed(d)) return d;
  const p = placeInput(d, at ?? { x: MARGIN, y: MARGIN });
  return { ...d, input: { text: '', x: p.x, y: p.y, to: startingAgents(d) } };
}

/** Where the Input goes for `at`: there, or the nearest place clear of every card and group. */
function placeInput(d: TeamDraft, at: Point): Point {
  return clearOf({ x: snap(at.x), y: snap(at.y) }, [...drawnGroups(d), ...d.agents.map(agentBox)]);
}

export const moveInput = (d: TeamDraft, to: Point): TeamDraft => (d.input ? { ...d, input: { ...d.input, ...placeInput(d, to) } } : d);
export const setInputText = (d: TeamDraft, text: string): TeamDraft => (d.input ? { ...d, input: { ...d.input, text } } : d);
export const removeInput = (d: TeamDraft): TeamDraft => {
  const { input: _gone, ...rest } = d;
  return rest;
};

/** Points the Input to an agent (again: a no-op), or stops pointing to it. */
export function linkInput(d: TeamDraft, agent: string, on: boolean): TeamDraft {
  if (!d.input || !d.agents.some((a) => a.id === agent) || d.input.to.includes(agent) === on) return d;
  const to = on ? [...d.input.to, agent] : d.input.to.filter((a) => a !== agent);
  return { ...d, input: { ...d.input, to } };
}

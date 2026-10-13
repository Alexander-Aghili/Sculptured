import type { DraftIssue } from '../generated/DraftIssue';
import type { ElementKind } from '../generated/ElementKind';
import type { TeamDraft } from '../generated/TeamDraft';
import type { SaveState } from '../useTeamDraft';
import type { Selection } from './edits';
import { plural } from '../format';

/** ▲ must be fixed before Start; △ is a note. */
export const MARK = { error: '▲', warning: '△' } as const;

const exists = (d: TeamDraft, kind: ElementKind, id: string) =>
  kind === 'team'
    ? true
    : kind === 'agent'
      ? d.agents.some((a) => a.id === id)
      : kind === 'group'
        ? d.groups.some((g) => g.id === id)
        : d.connections.some((c) => c.id === id);

/** Issues for elements still in the draft (a deleted agent's problem is gone with it). */
export function liveIssues(d: TeamDraft, issues: DraftIssue[]): DraftIssue[] {
  return issues.filter((i) => exists(d, i.element.kind, i.element.id));
}

export function issuesFor(issues: DraftIssue[], kind: ElementKind, id: string): DraftIssue[] {
  return issues.filter((i) => i.element.kind === kind && i.element.id === id);
}

export const errorsOf = (issues: DraftIssue[]) => issues.filter((i) => i.severity === 'error');

/** The board element an issue is pinned to, if it is one you can select. */
export function selectionFor(d: TeamDraft, issue: DraftIssue): Selection | null {
  const { kind, id } = issue.element;
  if (kind === 'team' || !exists(d, kind, id)) return null;
  return { kind, id };
}

/** Why Start team is disabled, in words; null when it can start. */
export function startReason(p: { issues: DraftIssue[]; saveState: SaveState; running: boolean; starting: boolean; empty: boolean }): string | null {
  if (p.starting) return 'Starting…';
  if (p.running) return 'The team is running.';
  if (p.saveState === 'conflict') return 'Reload the latest version first.';
  if (p.saveState === 'error') return 'Your last change was not saved. Fix it or undo it first.';
  if (p.empty) return 'Add an agent first.';
  const errs = errorsOf(p.issues);
  if (errs.length === 0) return null;
  return `${plural(errs.length, 'thing')} to fix: ${errs.map((i) => i.message).join('; ')}`;
}

/** Short words for an agent's folder problem, for the folder line on its card. */
export const FOLDER_ISSUE_WORDS: Record<string, string> = {
  'folder-missing': 'needs a folder',
  'folder-not-absolute': 'needs a full folder path',
  'folder-outside-home': 'outside your home folder',
  'folder-unreadable': "can't be read",
  'folder-bad-path': "path can't be used",
  'folder-not-found': 'no longer exists',
  'folder-not-a-folder': 'a file, not a folder',
  'home-unknown': 'home folder unknown',
};

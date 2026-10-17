import type { DecisionEntry } from './generated/DecisionEntry';

export type MapSection = { title: string; line: number; end: number };
export type MapArea = { path: string; files: number; kinds: [string, number][]; about?: string | null; docs: { file: string; sections: MapSection[] }[] };
export type SharedCheck = { name: string; value: string; file: string; status: 'found' | 'missing' | 'no-file'; line?: number };
export type ProjectMap = { root: string; files: number; areas: MapArea[]; truncated: boolean; file: string; kept?: string[]; shared?: SharedCheck[] };

/** What agents record: a lesson (a tip) or a constraint (a rule every agent follows). */
export const isLearned = (e: DecisionEntry) => e.source === 'lesson' || e.source === 'constraint';
export type Knowledge = {
  maps: { folder: string; at_ms: number; map: ProjectMap; workers: Record<string, string[]> }[];
  entries: DecisionEntry[];
};

const SEEN = (rig: string) => `sculptured.knowledge-seen.${rig}`;

/** When this browser last opened the team's Knowledge view (0 if never or unreadable). */
export function seenAt(rig: string): number {
  try { return Number(localStorage.getItem(SEEN(rig)) ?? 0) || 0; } catch { return 0; }
}

export function markSeen(rig: string, at = Date.now()) {
  try { localStorage.setItem(SEEN(rig), String(at)); } catch { /* private window: the count just stays */ }
}

/** Lessons agents recorded since the view was last opened. */
export const newLessons = (k: Knowledge | null | undefined, since: number) => (k?.entries ?? []).filter((e) => isLearned(e) && e.at_ms > since).length;

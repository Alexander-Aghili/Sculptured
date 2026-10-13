import type { ComponentType } from 'react';

export type Citation = { title: string; url?: string; localPath?: string; section: string; author?: string; license?: string };
export type Check = { kind: 'mathematical' | 'interface' | 'integration'; revision: string; evidence: string; status: 'unrun' | 'passed' | 'failed'; reviewer: string };
export type Lesson = {
  id: string; title: string; chapter: string; order: number; summary: string;
  objectives: string[]; prerequisites: string[]; sources: Citation[]; revision: string;
  checks: Check[]; Content: ComponentType; Interaction?: ComponentType;
};

/** Run before assembly: stable links and prerequisites are part of the book's public contract. */
export function validateLessons(lessons: Lesson[]): string[] {
  const ids = new Set<string>(), problems: string[] = [];
  for (const l of lessons) {
    if (!/^[a-z][a-z0-9-]*$/.test(l.id) || ids.has(l.id)) problems.push(`Invalid or duplicate lesson ID: ${l.id}`);
    ids.add(l.id);
    if (!l.title || !l.summary || !l.revision || l.objectives.length === 0) problems.push(`${l.id}: incomplete teaching contract`);
    if (!l.sources.length) problems.push(`${l.id}: source references missing`);
    for (const c of l.checks) if (c.revision !== l.revision) problems.push(`${l.id}: stale ${c.kind} review`);
    for (const kind of ['mathematical', 'interface'] as const) {
      const checks = l.checks.filter(c => c.kind === kind && c.revision === l.revision);
      if (!checks.some(c => c.status === 'passed' && c.evidence.trim() && c.reviewer.trim()) || checks.some(c => c.status === 'failed')) problems.push(`${l.id}: ${kind} acceptance missing or failed`);
    }
  }
  for (const l of lessons) for (const p of l.prerequisites) if (!ids.has(p) || p === l.id) problems.push(`${l.id}: invalid prerequisite ${p}`);
  const visit = (id: string, path: Set<string>): boolean => path.has(id) || (lessons.find(l => l.id === id)?.prerequisites ?? []).some(p => visit(p, new Set([...path, id])));
  for (const l of lessons) if (visit(l.id, new Set())) problems.push(`${l.id}: prerequisite cycle`);
  return problems;
}

import type { TeamDraft } from '../generated/TeamDraft';
import { newId, groupOf } from '../draft/ids';
import { fitGroups } from '../draft/edits';
import { firstFreeSlot, nextFreeSlot } from '../draft/geometry';

export function addParallelWorker(draft: TeamDraft, stageId: string): TeamDraft {
  const w = draft.workflow!, stage = w.stages.find(s => s.id === stageId), original = draft.agents.find(a => a.id === stage?.agent);
  if (!stage || !original || (stage.workers?.length ?? 0) >= 7) return draft;
  const id = newId(`${original.id}-worker`, new Set(draft.agents.map(a => a.id)));
  const at = firstFreeSlot(draft, groupOf(original)) ?? nextFreeSlot(draft);
  const agent = { ...original, id, name:`${original.name} · worker ${(stage.workers?.length ?? 0) + 2}`, ...at };
  return fitGroups({ ...draft, agents:[...draft.agents,agent], workflow:{...w,stages:w.stages.map(s => s.id === stageId ? {...s, workers:[...(s.workers ?? []),id]} : s)} });
}

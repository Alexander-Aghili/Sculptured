import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Workflow } from '../generated/Workflow';
import type { WorkflowStage } from '../generated/WorkflowStage';
import { STAGE_TYPES, addStageAfter, asKind, typeOf, type StageType } from './stageKinds';

/** Pipeline options for one stage, closed by default: its type and that type's fields, a review panel, a round limit. */
export function StageAdvanced({ draft, stage: s, locked, update, change }: { draft: TeamDraft; stage: WorkflowStage; locked: boolean; update: (s: WorkflowStage) => void; change: (w: Workflow) => void }) {
  const w = draft.workflow!, type = typeOf(s);
  const [newType, setNewType] = useState<StageType>('check');
  const eligible = draft.agents.filter((a) => a.id !== w.dispatcher && a.id !== w.collector);
  const number = (v: string) => (v === '' ? undefined : Number(v));
  return <details className="stage-advanced" data-advanced>
    <summary>Advanced</summary>
    <fieldset disabled={locked}>
      <label>Stage type <select value={type} onChange={(e) => update(asKind(s, e.target.value as StageType, draft))}>
        {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select></label>
      {type === 'check' && <>
        <label>Command <input value={s.command ?? ''} maxLength={2000} onChange={(e) => update({ ...s, command: e.target.value })} /></label>
        <label>Time limit in seconds <input type="number" min={1} max={3600} placeholder="600" value={s.timeout_s ?? ''} onChange={(e) => update({ ...s, timeout_s: number(e.target.value) })} /></label>
        <p className="muted">Sculptured runs it in the item's folder (or the project folder) and follows passed or failed.</p>
      </>}
      {type === 'human' && <label>Question for the person <textarea maxLength={2048} value={s.prompt ?? ''} onChange={(e) => update({ ...s, prompt: e.target.value })} /></label>}
      {type === 'merge' && <label>Merge into branch <input placeholder="the current branch" value={s.into ?? ''} onChange={(e) => update({ ...s, into: e.target.value.trim() || undefined })} /></label>}
      {type === 'panel' && <fieldset><legend>Reviewers (2–6)</legend>
        {eligible.map((a) => <label key={a.id}><input type="checkbox" checked={!!s.reviewers?.includes(a.id)} disabled={s.reviewers?.includes(a.id) ? (s.reviewers?.length ?? 0) <= 2 : (s.reviewers?.length ?? 0) >= 6}
          onChange={(e) => update({ ...s, reviewers: e.target.checked ? [...(s.reviewers ?? []), a.id] : (s.reviewers ?? []).filter((id) => id !== a.id) })} />{a.name}</label>)}
        <label>Decide when <select value={s.join ?? 'all'} onChange={(e) => update({ ...s, join: e.target.value === 'any' ? 'any' : undefined })}>
          <option value="all">every reviewer approves</option><option value="any">the first reviewer approves</option>
        </select></label>
      </fieldset>}
      {type === 'agent' && <>
        <label>Hand over after this many rounds <input type="number" min={1} max={20} value={s.escalate?.after_rounds ?? ''} onChange={(e) => {
          const n = number(e.target.value);
          update({ ...s, escalate: n ? { after_rounds: n, agent: s.escalate?.agent ?? eligible.find((a) => a.id !== s.agent)?.id ?? '' } : undefined });
        }} /></label>
        {s.escalate && <label>Hand over to <select value={s.escalate.agent} onChange={(e) => update({ ...s, escalate: { ...s.escalate!, agent: e.target.value } })}>
          {eligible.filter((a) => a.id !== s.agent).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>}
      </>}
      <label>Most rounds per item <input type="number" min={1} max={20} value={s.max_rounds ?? ''} onChange={(e) => { const max = number(e.target.value); update({ ...s, max_rounds: max, on_limit: max ? s.on_limit : undefined }); }} /></label>
      {s.max_rounds != null && <label>After the last round, go to <select value={s.on_limit ?? ''} onChange={(e) => update({ ...s, on_limit: e.target.value || undefined })}>
        <option value="">block the item</option>
        {w.stages.filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select></label>}
      <div className="stage-advanced-add">
        <label>New stage after this one <select value={newType} onChange={(e) => setNewType(e.target.value as StageType)}>
          {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select></label>
        <button className="btn" disabled={w.stages.length >= 16} onClick={() => change(addStageAfter(w, s.id, newType, draft))}>Add stage</button>
      </div>
    </fieldset>
  </details>;
}

import { TextbookSetup } from './TextbookSetup';
import { useEffect, useRef } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Workflow } from '../generated/Workflow';
import { TextArea } from '../shell/TextArea';
import { WorkflowBoard, WorkflowSettings } from './WorkflowBoard';
import { StageEditor } from './StageEditor';
import { WorkflowRunView } from './WorkflowRunView';
import type { WorkflowTarget } from './WorkflowGraph';
import { addParallelWorker } from './workers';

export function WorkflowInspector({ draft, target, locked, edit, onOpen, onClose }: { draft: TeamDraft; target: WorkflowTarget | 'list'; locked: boolean; edit: (fn: (d: TeamDraft) => TeamDraft) => void; onOpen: (id: string) => void; onClose: () => void }) {
  const box = useRef<HTMLElement>(null), previous = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => { const origin = previous.current; box.current?.focus({ preventScroll:true }); return () => origin?.focus({ preventScroll:true }); }, []);
  const w = draft.workflow!, change = (workflow: Workflow) => edit(d => ({ ...d, workflow }));
  const title = typeof target === 'object' ? 'Stage & branches' : target === 'input' ? 'Input' : target === 'settings' ? 'Dispatch & composition' : target === 'run' ? 'Assembly & work evidence' : 'Workflow list';
  return <aside className="workflow-inspector" ref={box} tabIndex={-1} aria-label={title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header><h2>{title}</h2><button className="btn" onClick={onClose}>Close workflow details</button></header>
    <div className="workflow-inspector-body">
      {target === 'input' && <section className="workflow-input"><p>Dump links, notes, questions and ideas here. Saved with this project; the dispatcher reads these when you start the team.</p><TextArea aria-label="Workflow input" value={w.input} readOnly={locked} rows={12} maxLength={64000} onChange={e => change({ ...w, input: e.target.value })} /><p>{locked ? 'Stop the project before changing Input.' : 'No generation starts until you start the team.'}</p><TextbookSetup draft={draft} locked={locked} edit={edit} /></section>}
      {target === 'settings' && <><p>The dispatcher chooses 1–{w.max_tasks} items, each with up to {w.max_steps} steps. Shared agents handle one assignment at a time.</p><WorkflowSettings draft={draft} locked={locked} change={change} editTeam={edit} expanded /></>}
      {typeof target === 'object' && <StageEditor key={target.stage} draft={draft} stageId={target.stage} locked={locked} change={change} onOpen={onOpen} onAddWorker={() => edit(d => addParallelWorker(d,target.stage))} />}
      {target === 'run' && <><p>Assembly waits for every item to complete its review route. Acceptance is agent-reported; inspect the evidence.</p><WorkflowRunView draft={draft} /></>}
      {target === 'list' && <WorkflowBoard draft={draft} locked={locked} edit={edit} onOpen={onOpen} />}
    </div>
  </aside>;
}

import {DismissibleError} from '../shell/DismissibleError';
import { isTextField } from '../dom';
import { useRef, useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import type { GroupBlock } from '../generated/GroupBlock';
import { fitGroups, selectionExists, type Selection } from '../draft/edits';
import { newId } from '../draft/ids';
import { start, push, undo, redo } from '../draft/history';
import { AgentPanel, ConnectionPanel, GroupPanel, type Edit } from '../structure/Panels';
import { StructureCanvas } from '../structure/StructureCanvas';
import { WorkflowInspector } from '../workflow/WorkflowInspector';
import type { WorkflowTarget } from '../workflow/WorkflowGraph';
import { Btn } from '../shell/ui';

export function GroupEditor({initial,onBack,onSaved}:{initial:GroupBlock;onBack:()=>void;onSaved:(b:GroupBlock)=>void}) {
  const [block,setBlock]=useState(initial),[history,setHistory]=useState(()=>start(initial.draft)),ref=useRef(history);
  const [selection,setSelection]=useState<Selection|null>(null),[details,setDetails]=useState(false),[target,setTarget]=useState<WorkflowTarget|null>(null);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(initial.revision>0),[leaving,setLeaving]=useState(false);
  const d=history.present, selected=selectionExists(d,selection)?selection:null;
  const commit=(h:typeof history)=>{ref.current=h;setHistory(h);setSaved(false);};
  const edit:Edit=(fn,key)=>{
    const r=fn(ref.current.present),result='agents' in r?{draft:r}:r;
    if(result.reason){setNotice(result.reason);return result.reason;}
    const next=result.draft,g=next.groups[0];
    if(!g){setNotice('Keep one group in this reusable block.');return 'Keep one group in this reusable block.';}
    const normalized=fitGroups({...next,groups:[g],agents:next.agents.map(a=>({...a,group_id:g.id}))});
    commit(push(ref.current,normalized,key));setNotice('');return null;
  };
  const inspect=(s:Selection|null)=>{setSelection(s);setDetails(!!s);};
  const save=async()=>{
    setBusy(true);setNotice('');
    try {const next=await api.saveGroupBlock({...block,name:d.groups[0].label,draft:d});setBlock(next);onSaved(next);setSaved(ref.current.present===d);}catch(e){setNotice(errorText(e));}finally{setBusy(false);}
  };
  const addStage=()=>edit(d=>{
    const w=d.workflow??{input:'',dispatcher:'',collector:'',entry:'',max_tasks:24,max_steps:12,stages:[]};
    const id=newId('stage',new Set(w.stages.map(s=>s.id)));
    setTarget({stage:id});
    return {...d,workflow:{...w,entry:w.entry||id,stages:[...w.stages,{id,name:'New stage',agent:d.agents[0].id,routes:{done:null}}]}};
  });
  return <section className="group-editor" aria-label="Reusable group editor" onKeyDown={e=>{
    if(!(e.ctrlKey||e.metaKey))return;
    if(e.key.toLowerCase()==='s'){e.preventDefault();if(!busy&&d.groups[0].label.trim())void save();}
    if(e.key.toLowerCase()==='z'&&!isTextField(e.target)){e.preventDefault();commit(e.shiftKey?redo(ref.current):undo(ref.current));}
  }}>
    <header className="panel-bar"><Btn onClick={()=>saved?onBack():setLeaving(true)}>Back to groups</Btn><label>Group name <input aria-label="Group name" value={d.groups[0].label} onChange={e=>edit(d=>({...d,groups:[{...d.groups[0],label:e.target.value}]}),'group-name')} /></label>
      <span role="status">{busy?'Saving…':saved?'Saved in Library':'Unsaved changes'}</span><Btn onClick={save} disabled={busy||!d.groups[0].label.trim()}>Save group</Btn>
      <Btn disabled={!d.agents.length||!!d.connections.length} onClick={addStage} tip="Add a reusable workflow stage when the group has agents and no ordinary connections">Add workflow stage</Btn></header>
    {leaving&&<div className="group-notice">This group has unsaved changes. <Btn onClick={onBack}>Discard edits and leave</Btn><Btn onClick={()=>setLeaving(false)}>Keep editing</Btn></div>}
    <div className="group-notice">Reusable block · no project or agent run is created. Agents inherit the destination project’s folder.</div>
    {notice&&<DismissibleError className="group-notice">{notice}</DismissibleError>}
    {block.boundary_notes.length>0&&<details className="group-notice"><summary>External connections to reconnect ({block.boundary_notes.length})</summary><ul>{block.boundary_notes.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}
    <div className={`group-editor-body${details&&selected?' inspecting':''}`}><div className="sb-stage">
      <StructureCanvas groupOnly teamId={`library:${block.id}`} draft={d} issues={[]} selection={selected} onSelect={setSelection} onInspect={inspect} onOpen={id=>inspect({kind:'agent',id})} onOpenAgent={id=>inspect({kind:'agent',id})} onWorkflow={setTarget} edit={edit} locked={false} canUndo={history.past.length>0} canRedo={history.future.length>0} onUndo={()=>commit(undo(ref.current))} onRedo={()=>commit(redo(ref.current))} />
    </div>{details&&selected&&<aside className="sb-side">
      {selected.kind==='agent'&&<AgentPanel draft={d} agentId={selected.id} issues={[]} edit={edit} locked={false} onSelect={inspect} />}
      {selected.kind==='group'&&<GroupPanel librarySave={false} draft={d} groupId={selected.id} issues={[]} edit={edit} locked={false} onSelect={inspect} />}
      {selected.kind==='connection'&&<ConnectionPanel draft={d} connectionId={selected.id} issues={[]} edit={edit} locked={false} onSelect={inspect} />}
    </aside>}</div>
    {target&&d.workflow&&<WorkflowInspector draft={d} target={target} locked={false} edit={edit} onOpen={id=>{setTarget(null);inspect({kind:'agent',id});}} onClose={()=>setTarget(null)} />}
  </section>;
}

import {DismissibleError} from '../shell/DismissibleError';
import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InspectBlock } from './InspectBlock';
import { AddToProject } from './AddToProject';
import { transferredBlock } from './blockTransfer';
import { downloadBlock, sanitizeExport } from '../release/sharing';
import { api } from '../api';
import { errorText } from '../errors';
import type { GroupBlock } from '../generated/GroupBlock';
import { Btn } from '../shell/ui';
import { TemplatePreview } from '../structure/TemplateGallery';
import { emptyBlock } from './blocks';
import { GroupEditor } from './GroupEditor';
import './groups.css';

export function GroupLibrary() {
  const [blocks,setBlocks]=useState<GroupBlock[]|null>(null),[editing,setEditing]=useState<GroupBlock|null>(null),[error,setError]=useState('');
  const [inspecting,setInspecting]=useState<GroupBlock|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const location=useLocation(),navigate=useNavigate();
  const [adding,setAdding]=useState<GroupBlock|null>(null);
  useEffect(()=>{if(!location.hash.startsWith('#import-block='))return;try{setAdding(transferredBlock(location.hash));}catch(e){setError((e as Error).message);}navigate(location.pathname+location.search,{replace:true});},[location.hash,location.pathname,location.search,navigate]);
  const reload=()=>{setError('');api.groupBlocks().then(setBlocks,e=>setError(errorText(e)));};
  useEffect(reload,[]);
  if(editing)return <GroupEditor key={editing.id} initial={editing} onBack={()=>{setEditing(null);reload();}} onSaved={saved=>setBlocks(list=>[...(list??[]).filter(b=>b.id!==saved.id),saved])} />;
  return <section className="group-library" aria-label="Saved group blocks"><header><div><h2>Reusable groups</h2><p>Add any saved group directly to a project, or drag it onto a board from <strong>Saved groups</strong>. Each insertion is an independent copy.</p></div><Btn icon="plus" onClick={()=>setEditing(emptyBlock())}>Create group block</Btn></header>
    {error&&<DismissibleError>{error} <Btn onClick={reload}>Retry</Btn></DismissibleError>}{!blocks&&!error&&<p>Loading saved groups…</p>}{blocks?.length===0&&<p>No groups saved yet. Create one here or select a project’s group and choose Save group to Library.</p>}
    <div className="library-import"><Btn onClick={()=>fileInput.current?.click()}>Import group file</Btn><span>Review a downloaded block before saving it.</span><input ref={fileInput} hidden aria-label="Import group file" type="file" accept=".json" onChange={async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>500000)throw Error('Group is too large');const b=sanitizeExport(JSON.parse(await f.text()));b.id=`import-${crypto.randomUUID().slice(0,12)}`;b.revision=0;setEditing(b);}catch(e){setError((e as Error).message);}e.target.value='';}} /></div>
    <div className="group-library-grid">{blocks?.map(b=><article className="group-library-card" key={b.id}>
      <button className="library-card-preview" aria-label={`Inspect ${b.name}`} onClick={()=>setInspecting(b)}><TemplatePreview draft={b.draft} practice={false}/></button>
      <div className="library-card-body"><h3>{b.name}</h3><p>{b.draft.agents.length} {b.draft.agents.length===1?'agent':'agents'} · {b.draft.workflow?`${b.draft.workflow.stages.length} workflow stages`:`${b.draft.connections.length} connections`}</p>
      {b.boundary_notes.length>0&&<small>{b.boundary_notes.length} external connections to reconnect</small>}</div>
      <div className="block-card-actions"><button className="btn btn-primary" onClick={()=>setAdding(b)}>Add to project <span aria-hidden="true">↗</span></button><div className="block-secondary-actions"><button onClick={()=>setInspecting(b)}>Inspect</button><button aria-label={`Edit ${b.name}`} onClick={()=>setEditing(b)}>Edit</button><button aria-label={`Export ${b.name}`} onClick={()=>downloadBlock(b)}>Export</button></div></div>
    </article>)}</div>
    {inspecting&&<InspectBlock key={inspecting.id} block={inspecting} onClose={()=>setInspecting(null)} onAdd={()=>{setAdding(inspecting);setInspecting(null);}}/>}
    {adding&&<AddToProject key={adding.id} block={adding} onClose={()=>setAdding(null)}/> }
  </section>;
}

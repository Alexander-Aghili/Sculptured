import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, newRequestId } from '../api';
import { errorText } from '../errors';
import type { GroupBlock } from '../generated/GroupBlock';
import type { TeamSummary } from '../generated/TeamSummary';
import type { TeamRecord } from '../generated/TeamRecord';
import { insertBlock } from './blocks';
import { DismissibleError } from '../shell/DismissibleError';
import { BlockFeatures, BlockDetails } from './BlockDetails';

export function AddToProject({block,onClose}:{block:GroupBlock;onClose:()=>void}) {
  const navigate=useNavigate(), dialog=useRef<HTMLDialogElement>(null);
  const [teams,setTeams]=useState<TeamSummary[]>([]),[destination,setDestination]=useState('new'),[name,setName]=useState(block.name),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const created=useRef<TeamRecord|null>(null),requestId=useRef(newRequestId());
  const pendingSave=useRef<{team:TeamRecord;draft:TeamRecord['draft'];request:string}|null>(null);
  const creationName=useRef<string|null>(null);
  const openProject=(id:string)=>{window.dispatchEvent(new Event('projects-changed'));navigate(`/team/${encodeURIComponent(id)}/structure`);onClose();};
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();Promise.all([api.listTeams(),api.projectVisibility()]).then(([list,visibility])=>setTeams(list.filter(t=>!visibility.some(v=>v.id===t.id&&v.status==='trashed'))),e=>setError(errorText(e)));return()=>previous?.focus();},[]);
  const add=async()=>{
    if(busy)return;setBusy(true);setError('');
    try {
      if(pendingSave.current){const p=pendingSave.current;await api.saveTeam(p.team.draft.id,p.team.draft.revision,p.draft,p.request);openProject(p.team.draft.id);return;}
      let team:TeamRecord;
      if(destination==='new') {team=created.current??await api.createTeam('blank',false,creationName.current??(creationName.current=name.trim()),requestId.current);created.current=team;}
      else team=await api.getTeam(destination);
      if(team.live) {setError('Stop this project before adding agents, or choose a new project.');return;}
      const result=insertBlock(team.draft,block);
      if(result.reason){setError(result.reason);return;}
      const saveId=newRequestId();pendingSave.current={team,draft:result.draft,request:saveId};
      await api.saveTeam(team.draft.id,team.draft.revision,result.draft,saveId);
      openProject(team.draft.id);
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  return <dialog ref={dialog} className="block-modal project-picker" aria-label={`Add ${block.name} to project`} onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <header><h2>Add {block.name}</h2><button className="btn" disabled={busy} onClick={onClose}>Cancel</button></header>
    <BlockFeatures block={block}/><details><summary>Inspect this block</summary><BlockDetails block={block}/></details>
    <form onSubmit={e=>{e.preventDefault();void add();}}><label>Destination project<select value={destination} disabled={busy||!!created.current||!!pendingSave.current||!!creationName.current} onChange={e=>setDestination(e.target.value)}><option value="new">Create a new project</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {destination==='new'&&<label>Project name<input required maxLength={150} value={name} disabled={busy||!!created.current||!!pendingSave.current||!!creationName.current} onChange={e=>setName(e.target.value)}/></label>}
      <p className="muted">Adds an independent copy and opens its board. Review instructions and choose a folder before starting agents.</p>
      {block.boundary_notes.length>0&&<details><summary>Connections to reconnect</summary><ul>{block.boundary_notes.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}
      {error&&<DismissibleError>{error}</DismissibleError>}
      <button className="btn btn-primary" disabled={busy||destination==='new'&&!name.trim()}>{busy?'Adding…':'Add & open project'}</button>
    </form>
  </dialog>;
}

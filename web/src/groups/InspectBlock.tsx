import {useEffect,useRef} from 'react';
import type {GroupBlock} from '../generated/GroupBlock';
import {BlockDetails,BlockFeatures} from './BlockDetails';
export function InspectBlock({block,onClose,onAdd}:{block:GroupBlock;onClose:()=>void;onAdd:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>previous?.focus();},[]);
  return <dialog ref={dialog} className="block-modal block-inspect-modal" aria-label={`Inspect ${block.name}`} onCancel={onClose}><header><h2>{block.name}</h2><button className="btn" onClick={onClose}>Close</button></header><BlockFeatures block={block}/><div className="release-actions"><button className="btn btn-primary" onClick={onAdd}>Add to project</button></div><BlockDetails block={block}/>{block.boundary_notes.length>0&&<details><summary>Connections to reconnect</summary><ul>{block.boundary_notes.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}</dialog>;
}

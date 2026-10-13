import {DismissibleError} from '../shell/DismissibleError';
import { useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { errorText } from '../errors';
import type { GroupBlock } from '../generated/GroupBlock';
import type { TeamDraft } from '../generated/TeamDraft';
import { Btn } from '../shell/ui';
import { blockCompatibility } from './blocks';

export function GroupPalette({draft,locked,onDrag,onAdd}:{draft:TeamDraft;locked:boolean;onDrag:(b:GroupBlock,e:PointerEvent)=>void;onAdd:(b:GroupBlock)=>void}) {
  const [open,setOpen]=useState(false),[blocks,setBlocks]=useState<GroupBlock[]|null>(null),[error,setError]=useState('');
  return <div className="group-palette"><Btn icon="library" disabled={locked} aria-expanded={open} onClick={async()=>{setOpen(!open);if(!open){setError('');try{setBlocks(await api.groupBlocks());}catch(e){setError(errorText(e));}}}}>Saved groups</Btn>
    {open&&<div className="group-palette-pop" role="region" aria-label="Saved groups"><strong>Drag a group onto the board, or click to add</strong>{error&&<DismissibleError>{error}</DismissibleError>}{!blocks&&!error&&<p>Loading…</p>}{blocks?.length===0&&<p>No saved groups yet.</p>}
      {blocks?.map(b=>{const reason=blockCompatibility(draft,b);return <div key={b.id}><button className="btn" disabled={!!reason} onPointerDown={e=>onDrag(b,e)} onClick={()=>onAdd(b)}>{b.name} · {b.draft.agents.length} agents</button>{reason&&<small>{reason}</small>}</div>;})}
      <Link to="/library/groups">Create or edit saved groups</Link><Btn variant="ghost" onClick={()=>setOpen(false)}>Close saved groups</Btn>
    </div>}
  </div>;
}

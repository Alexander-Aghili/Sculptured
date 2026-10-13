import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { errorText } from '../errors';
import type { TeamDraft } from '../generated/TeamDraft';
import { Btn } from '../shell/ui';
import { captureGroup } from './blocks';

export function SaveGroupButton({draft,groupId}:{draft:TeamDraft;groupId:string}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false);
  return <div className="save-group-library"><Btn disabled={busy} icon="library" onClick={async()=>{
    setBusy(true);setMessage('');setSaved(false);
    try {const block=captureGroup(draft,groupId);await api.saveGroupBlock(block);setSaved(true);setMessage(`Saved ${block.name} to Library.${block.boundary_notes.length ? ' External connections are listed for reconnection.' : ''}`);}catch(e){setMessage(errorText(e));}finally{setBusy(false);}
  }}>{busy?'Saving…':'Save group to Library'}</Btn><p className="muted">Saves an independent copy. Inserted agents inherit their new project’s folder.</p>{message&&<p role="status">{message} {saved&&<Link to="/library/groups">Open Library</Link>}</p>}</div>;
}

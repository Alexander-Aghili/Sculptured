import {DismissibleError} from '../shell/DismissibleError';
import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import { api } from '../api';
import { errorText } from '../errors';
import { ProjectFolder } from '../structure/ProjectFolder';

export function TextbookSetup({ draft, locked, edit }: { draft: TeamDraft; locked: boolean; edit?: (fn:(d:TeamDraft)=>TeamDraft)=>void }) {
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [done,setDone]=useState<{folder:string;files:number;commands:string[]}|null>(null);
  const prepare = async () => { setBusy(true); setError(''); try {
    const saved = await api.getTeam(draft.id);
    if(saved.draft.folder!==draft.folder) { setError('Wait for the project folder to finish saving, then try again.'); return; }
    setDone(await api.prepareTextbook(draft.id,saved.draft.revision));
  } catch(e) { setError(errorText(e)); } finally { setBusy(false); } };
  const complete = done?.folder===draft.folder;
  return <details className="textbook-setup"><summary>Live textbook starter</summary>
    <p>A reusable local React textbook, mathematical controls, module contracts, tests, and detailed guidance for the dispatcher, reference, builder, reviewers and frontend.</p>
    {edit && <ProjectFolder draft={draft} locked={locked || busy} edit={fn=>{ edit(d=>{ const result=fn(d); return 'draft' in result ? result.draft : result; }); return null; }} />}
    <p>Choose an empty project folder. Preparation adds the starter files; it does not run agents or choose a course. Existing textbook work stays in its current folder.</p>
    <button className="btn" disabled={locked || busy || !draft.folder || complete} onClick={()=>void prepare()}>{busy?'Preparing…':complete?'Starter prepared':'Prepare textbook folder'}</button>
    {!draft.folder&&<p>Choose a project folder first.</p>}{locked&&<p>Stop the team before preparing a folder.</p>}
    {complete&&done&&<div role="status"><p>{done.files} starter files prepared in <code>{done.folder}</code>.</p><p>In that folder, run:</p><pre>{done.commands.join('\n')}</pre><p>Add sources and teaching goals to Input, then start the team when ready. No source is preselected.</p></div>}
    {error&&<DismissibleError>{error}</DismissibleError>}
  </details>;
}

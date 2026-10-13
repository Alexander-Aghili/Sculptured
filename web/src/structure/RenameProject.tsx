import { useId, useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Edit } from './Panels';
import { renameTeam } from '../draft/edits';
import { Btn } from '../shell/ui';

export function RenameProject({ draft, edit }: { draft: TeamDraft; edit: Edit }) {
  const [editing, setEditing] = useState(false);
  const id = useId();
  if (!editing) return <Btn onClick={() => setEditing(true)}>Rename project</Btn>;
  return <div className="rename-project">
    <label htmlFor={id}>Project name</label>
    <input id={id} autoFocus className="fld-input" value={draft.name} onChange={e => edit(d => renameTeam(d, e.target.value), 'team-name')}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditing(false); } }} />
    <Btn onClick={() => setEditing(false)}>Done</Btn>
  </div>;
}

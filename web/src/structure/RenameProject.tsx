import { useRef, useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Edit } from './Panels';
import { renameTeam } from '../draft/edits';

/** The project's name as the board's title. Double-click it (or focus it and press Enter) to rename it
 * in place; Enter or leaving the field keeps the new name, Escape puts the old one back. */
export function RenameProject({ draft, edit }: { draft: TeamDraft; edit: Edit }) {
  const [editing, setEditing] = useState(false);
  const before = useRef(draft.name);
  const start = () => { before.current = draft.name; setEditing(true); };
  const name = draft.name || 'Unnamed team';
  if (!editing) {
    return (
      <span role="button" tabIndex={0} className="team-title project-name" aria-label={`${name}. Rename project`} title="Double-click to rename"
        onDoubleClick={start} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); start(); } }}>
        {name}
      </span>
    );
  }
  return (
    <input aria-label="Project name" autoFocus className="project-name-input" value={draft.name}
      size={Math.max(8, draft.name.length + 1)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => edit((d) => renameTeam(d, e.target.value), 'team-name')}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); setEditing(false); }
        if (e.key === 'Escape') { e.preventDefault(); edit((d) => renameTeam(d, before.current), 'team-name'); setEditing(false); }
      }} />
  );
}

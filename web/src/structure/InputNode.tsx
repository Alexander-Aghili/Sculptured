import './input.css';
import { useEffect, useRef, useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import { connectionPath, type Box } from '../draft/geometry';
import { linkInput, removeInput, setInputText, teamInputBox } from '../draft/input';
import { Btn } from '../shell/ui';
import { TextArea } from '../shell/TextArea';
import { FolderPicker } from './FolderPicker';
import { withFiles } from './PickFiles';
import { LOCK_REASON, nameOf, type Edit } from './Panels';

/** The wire's start while dragging from the Input's ● (it is not an agent). */
export const INPUT_WIRE = '$team-input';

type NodeProps = {
  draft: TeamDraft;
  box: Box;
  selected: boolean;
  locked: boolean;
  controls: Omit<React.ComponentProps<'button'>, 'className' | 'style'>;
  onPortDown: (e: React.PointerEvent) => void;
};

/** The Input box: its first lines, who gets it, and a ● to drag to another agent. */
export function InputNode({ draft, box, selected, locked, controls, onPortDown }: NodeProps) {
  const input = draft.input!;
  const names = input.to.map((id) => nameOf(draft, id));
  return (
    <div className="team-input-slot" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <button type="button" {...controls} className={`team-input-node${selected ? ' selected' : ''}`} style={{ inset: 0 }}
        aria-label={`Input: ${input.text.trim() ? input.text.trim().slice(0, 80) : 'empty'}. Goes to ${names.join(', ') || 'no agent'}`}>
        <strong>Input</strong>
        <span className={`team-input-text${input.text.trim() ? '' : ' muted'}`}>{input.text.trim() || 'The goal, links and notes. Click to write it.'}</span>
        <small>{names.length ? `→ ${names.join(', ')}` : 'Drag ● to an agent'}</small>
      </button>
      {!locked && <span className="port out" role="presentation" data-tip="Drag to an agent to give it the Input" onPointerDown={onPortDown} />}
    </div>
  );
}

/** Dotted arrows from the Input to each agent it goes to (agents hidden in a closed group are skipped). */
export function InputEdges({ draft, boxes, marker }: { draft: TeamDraft; boxes: Record<string, Box>; marker: string }) {
  const from = teamInputBox(draft);
  if (!from) return null;
  return draft.input!.to.filter((id) => boxes[id]).map((id) => (
    <path key={`input-${id}`} className="edge enforced input-edge" d={connectionPath(from, boxes[id]).d} markerEnd={`url(#${marker})`} />
  ));
}

/** Writing the Input, and choosing who gets it. */
export function InputEditor({ draft, edit, locked, onClose }: { draft: TeamDraft; edit: Edit; locked: boolean; onClose: () => void }) {
  const box = useRef<HTMLElement>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => box.current?.querySelector('textarea')?.focus(), []);
  const input = draft.input;
  if (!input) return null;
  return (
    <aside ref={box} className="workflow-inspector team-input-editor" role="dialog" aria-label="Input" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <header><h2>Input</h2><Btn variant="ghost" icon="x" iconOnly onClick={onClose} aria-label="Close Input" kbd="esc" /></header>
      <div className="workflow-inspector-body">
        <p className="muted">The goal, links and notes for this project. Each agent it goes to gets it after its Job when the team starts.</p>
        <TextArea aria-label="Input text" value={input.text} rows={10} maxLength={64000} onChange={(e) => edit((d) => setInputText(d, e.target.value), 'input-text')} />
        <Btn icon="upload" onClick={() => setPicking(true)} tip="Choose files on the agents' computer: their paths are added here for the agents to open">Upload</Btn>
        {picking && (
          <FolderPicker initialPath={draft.folder ?? null} onChoose={() => undefined} onClose={() => setPicking(false)}
            pickFiles={(paths) => { edit((d) => setInputText(d, withFiles(d.input?.text ?? '', paths))); setPicking(false); }} />
        )}
        <fieldset disabled={locked} title={locked ? LOCK_REASON : undefined}>
          <legend>Goes to</legend>
          {draft.agents.length === 0 && <p className="muted">Add an agent first.</p>}
          {draft.agents.map((a) => (
            <label key={a.id}><input type="checkbox" checked={input.to.includes(a.id)} onChange={(e) => edit((d) => linkInput(d, a.id, e.target.checked))} />{a.name.trim() || 'Unnamed agent'}</label>
          ))}
        </fieldset>
        <Btn disabled={locked} tip={locked ? LOCK_REASON : undefined} onClick={() => { edit(removeInput); onClose(); }}>Remove the Input</Btn>
      </div>
    </aside>
  );
}

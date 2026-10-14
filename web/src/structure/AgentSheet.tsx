import './agent-details.css';
import { useEffect, useRef } from 'react';
import type { DraftIssue } from '../generated/DraftIssue';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Selection } from '../draft/edits';
import { Btn, VendorMark } from '../shell/ui';
import { KIND_LABEL } from '../vocab';
import { useDismiss } from './BoardMenu';
import { AgentPanel, kindVendor, type Edit } from './Panels';

type SheetProps = { draft: TeamDraft; agentId: string; issues: DraftIssue[]; edit: Edit; locked: boolean; onSelect: (s: Selection | null) => void; onClose: () => void };

/** An agent's details as a large, readable page over the board. */
export function AgentSheet({ draft, agentId, issues, edit, locked, onSelect, onClose }: SheetProps) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  const a = draft.agents.find((x) => x.id === agentId);
  useEffect(() => box.current?.focus(), []);
  if (!a) return null;
  const v = kindVendor(a.kind);
  return (
    <div className="sheet-backdrop">
      <div ref={box} className="agent-sheet" role="dialog" aria-modal="true" aria-label={`${a.name || 'Unnamed agent'} details`} tabIndex={-1}>
        <header className="sheet-head">
          <VendorMark v={v} size="md" />
          <h2 className="sheet-title">{a.name || 'Unnamed agent'}</h2>
          <span className={`vendor-name ${v.cls}`}>{KIND_LABEL[a.kind]}</span>
          <span className="pane-spacer" />
          <Btn variant="ghost" icon="x" iconOnly onClick={onClose} aria-label="Close details" kbd="esc" />
        </header>
        <div className="sheet-body">
          <AgentPanel bare draft={draft} agentId={agentId} issues={issues} edit={edit} locked={locked} onSelect={(s) => (s ? onSelect(s) : onClose())} />
        </div>
      </div>
    </div>
  );
}

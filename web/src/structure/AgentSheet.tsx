import './agent-details.css';
import { useEffect, useRef, type ReactNode } from 'react';
import type { AgentKind } from '../generated/AgentKind';
import type { DraftIssue } from '../generated/DraftIssue';
import type { TeamDraft } from '../generated/TeamDraft';
import { removeElement, type Selection } from '../draft/edits';
import { setKind } from '../draft/models';
import { Btn, VendorMark } from '../shell/ui';
import { KIND_LABEL } from '../vocab';
import { AgentPanel, kindVendor, LOCK_REASON, type Edit } from './Panels';

/** Closes on Escape and on a pointer press outside `ref`. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const inner = (document.activeElement as HTMLElement | null)?.closest('[role="dialog"]');
      if (e.key !== 'Escape' || (inner && inner !== ref.current)) return;
      e.stopPropagation();
      onClose();
    };
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
    };
  }, [ref, onClose]);
}

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

type MenuProps = { draft: TeamDraft; agentId: string; x: number; y: number; edit: Edit; locked: boolean; onOpen: () => void; onClose: () => void };

function MenuItem({ children, onClick, disabled, checked }: { children: ReactNode; onClick: () => void; disabled?: boolean; checked?: boolean }) {
  return (
    <li role="none">
      <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} disabled={disabled} title={disabled ? LOCK_REASON : undefined} onClick={onClick}>
        {children}
      </button>
    </li>
  );
}

/** The right-click menu on an agent card. */
export function AgentMenu({ draft, agentId, x, y, edit, locked, onOpen, onClose }: MenuProps) {
  const box = useRef<HTMLUListElement>(null);
  useDismiss(box, onClose);
  useEffect(() => box.current?.querySelector('button')?.focus(), []);
  const a = draft.agents.find((q) => q.id === agentId);
  if (!a) return null;
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const kinds: AgentKind[] = ['claude', 'codex', 'practice'];
  return (
    <ul ref={box} className="ctx-menu" role="menu" aria-label={`${a.name || 'Agent'} actions`} style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 220) }}>
      <MenuItem onClick={run(onOpen)}>Open details</MenuItem>
      <li role="separator" />
      {kinds.map((k) => (
        <MenuItem key={k} checked={a.kind === k} disabled={locked} onClick={run(() => edit((d) => setKind(d, a.id, k)))}>
          <VendorMark v={kindVendor(k)} size="xs" /> Runs on {KIND_LABEL[k]}
        </MenuItem>
      ))}
      <li role="separator" />
      <MenuItem disabled={locked} onClick={run(() => edit((d) => removeElement(d, { kind: 'agent', id: a.id })))}>
        <span className="tone-red">Delete agent</span> <span className="muted">· Ctrl+Z undoes</span>
      </MenuItem>
    </ul>
  );
}

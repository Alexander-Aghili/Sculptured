import { effectiveFolder } from '../draft/folders';
import { useEffect, useRef, useState } from 'react';
import type { CompiledRig } from '../generated/CompiledRig';
import type { Runtime } from '../generated/Runtime';
import type { TeamDraft } from '../generated/TeamDraft';
import { nameForId, type NameMap } from '../vocab';
import { Btn, Icon } from '../shell/ui';
import { shortPath } from './FolderPicker';
import { plural } from '../format';

/** What starting a team with real agents does, said before it happens. */
export type StartConfirmation = { title: string; body: string };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

type Starter = { id: string; name: string; kind: 'claude' | 'codex' | 'other'; folder: string | null };

function describe(agents: Starter[], handsTo: { from: string; to: string }[], home: string | null): StartConfirmation | null {
  const claude = agents.filter((a) => a.kind === 'claude');
  const codex = agents.filter((a) => a.kind === 'codex');
  if (claude.length === 0 && codex.length === 0) return null;
  const who = [claude.length ? plural(claude.length, 'Claude agent') : '', codex.length ? plural(codex.length, 'Codex agent') : ''].filter(Boolean);
  const accounts = [claude.length ? 'Claude' : '', codex.length ? 'Codex' : ''].filter(Boolean);
  const folders = [...new Set([...claude, ...codex].map((a) => (a.folder ? shortPath(a.folder, home) : '~ (home folder)')))];
  const where = folders.length === 1 ? folders[0] : `${folders.length} folders (${list(folders.slice(0, 3))}${folders.length > 3 ? ', …' : ''})`;
  // The first to start: agents no other agent of the team hands work to. They get their job at once.
  const ids = new Set(agents.map((a) => a.id));
  const heads = agents.filter((a) => !handsTo.some((c) => c.to === a.id && c.from !== a.id && ids.has(c.from)));
  return {
    title: `Start ${list(who)}?`,
    body: `They run in ${where} and use your ${list(accounts)} account${accounts.length > 1 ? 's' : ''}. First to start: ${heads.length ? list(heads.map((a) => a.name)) : 'unknown'}.`,
  };
}

/**
 * The confirmation a Start needs, or null when every agent is a Practice agent (free, no model
 * calls), which starts straight away. Real agents use the operator's own CLI logins.
 */
export function startConfirmation(d: TeamDraft | undefined, home: string | null): StartConfirmation | null {
  if (!d) return null;
  return describe(
    d.agents.map((a) => ({ id: a.id, name: a.name.trim() || 'Unnamed agent', kind: a.kind === 'practice' ? 'other' : a.kind, folder: effectiveFolder(d, a) })),
    d.workflow ? d.agents.filter(a => a.id !== d.workflow!.dispatcher).map(a => ({ from: d.workflow!.dispatcher, to: a.id })) : d.connections.filter((c) => c.kind === 'hands-work-to'),
    home,
  );
}

/** The same from a started team's compiled spec, for when its design has not loaded yet. */
export function specStartConfirmation(rig: CompiledRig, names: NameMap, home: string | null): StartConfirmation | null {
  const kind = (r: Runtime): Starter['kind'] => (r === 'claude-code' ? 'claude' : r === 'codex' ? 'codex' : 'other');
  return describe(
    rig.seats.map((s) => ({ id: s.id, name: nameForId(s.id, names), kind: kind(s.runtime), folder: s.cwd === '.' ? null : s.cwd })),
    rig.edges.filter((e) => e.kind === 'delegates_to'),
    home,
  );
}

/** A modal asking before a costly Start. Cancel has focus, so Enter alone never starts. */
export function StartConfirm({ c, onConfirm, onCancel }: { c: StartConfirmation; onConfirm: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => {
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="panel start-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="start-confirm-title"
        aria-describedby="start-confirm-body"
        // Keys stay in the dialog: board shortcuts must not fire behind it.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="panel-bar">
          <span className="panel-title" id="start-confirm-title">
            <Icon name="play" size={15} /> {c.title}
          </span>
        </div>
        <p className="pad" id="start-confirm-body">
          {c.body}
        </p>
        <div className="start-confirm-actions">
          <Btn ref={cancel} onClick={onCancel}>
            Cancel
          </Btn>
          <Btn variant="primary" icon="play" onClick={onConfirm}>
            Start team
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** `ask(c, go)`: runs `go` at once when `c` is null, else after the operator confirms. */
export function useStartConfirm() {
  const [pending, setPending] = useState<{ c: StartConfirmation; go: () => void } | null>(null);
  const ask = (c: StartConfirmation | null, go: () => void) => (c ? setPending({ c, go }) : go());
  const dialog = pending && (
    <StartConfirm
      c={pending.c}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const go = pending.go;
        setPending(null);
        go();
      }}
    />
  );
  return { ask, dialog };
}

import { useId, useState } from 'react';
import { api } from '../api';
import { diagnosticsOf, errorText } from '../errors';
import type { Diagnostic } from '../generated/Diagnostic';
import type { DraftIssue } from '../generated/DraftIssue';
import { DismissibleError } from '../shell/DismissibleError';
import { Btn } from '../shell/ui';
import { SessionPreview, type Converted } from './SessionPreview';

type OnCreated = (id: string, open?: { history?: boolean }) => void;
type Upload = { name: string; text: string };
type Failure = { message: string; diagnostics: Diagnostic[] };
type Left = { id: string; name: string; warnings: DraftIssue[] };

/** A Sculptured run file (by name, or its first line naming the format); anything else is a Claude Code or Codex session. */
const isRunFile = (f: Upload) => f.name.endsWith('.sculptured-session.jsonl') || (f.text.split('\n').find((l) => l.trim()) ?? '').includes('"format":"sculptured.session/v1"');

const read = (list: FileList | null) => Promise.all([...(list ?? [])].map(async (f) => ({ name: f.name, text: await f.text() })));

/**
 * Advanced: a past run opens read-only in History. A Sculptured run file imports as it is; a Claude Code or
 * Codex session (plus its subagents folder) is converted first, and what was found is shown before anything
 * is created.
 */
export function ImportRun({ onCreated }: { onCreated: OnCreated }) {
  const [left, setLeft] = useState<Left | null>(null);
  const [files, setFiles] = useState<Upload[]>([]);
  const [found, setFound] = useState<Converted | null>(null);
  const { busy, error, attempt } = useAttempt(() => setLeft(null));
  const importText = async (text: string) => {
    const r = await api.importRun(text);
    setFound(null);
    // The team the run came with could not be imported: say why before opening the run.
    const why = r.warnings.filter((w) => w.code.startsWith('run-team'));
    if (why.length > 0) setLeft({ id: r.team.draft.id, name: r.team.draft.name, warnings: why });
    else onCreated(r.team.draft.id, { history: true });
  };
  const take = (next: Upload[]) => attempt(async () => {
    setFiles(next);
    setFound(null);
    if (next.length === 1 && isRunFile(next[0])) return importText(next[0].text);
    setFound(await api.convertSession(next));
  });
  return (
    <div className="import-form" aria-label="Import a past run" role="group">
      <p className="muted">Import a past run: a Sculptured run file, or a Claude Code or Codex session (.jsonl, plus its subagents folder). It opens in History, read-only, and as a team you can run.</p>
      <Pickers busy={busy} canAddFolder={files.length > 0 && !isRunFile(files[0])} onFiles={(f) => void take(f)} onFolder={(f) => void take([...files, ...f])} />
      {found && <SessionPreview found={found} busy={busy} onImport={() => void attempt(() => importText(found.session))} onCancel={() => setFound(null)} />}
      {error && <Problems error={error} />}
      {left && <LeftOut left={left} onOpen={() => onCreated(left.id, { history: true })} />}
    </div>
  );
}

/** One call at a time: busy while it runs, and its error in plain words. */
function useAttempt(onStart: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    onStart();
    await work().catch((err: unknown) => setError({ message: errorText(err), diagnostics: diagnosticsOf(err) }));
    setBusy(false);
  };
  return { busy, error, attempt };
}

/** The files, and (for a Claude Code session) its subagents folder, which browsers pick as a folder. */
function Pickers({ busy, canAddFolder, onFiles, onFolder }: { busy: boolean; canAddFolder: boolean; onFiles: (f: Upload[]) => void; onFolder: (f: Upload[]) => void }) {
  const ids = useId();
  const pick = (input: HTMLInputElement, then: (f: Upload[]) => void) => {
    void read(input.files).then((f) => {
      input.value = '';
      const kept = f.filter((x) => x.name.endsWith('.jsonl') || x.name.endsWith('.json'));
      if (kept.length > 0) then(kept);
    });
  };
  return (
    <>
      <div className="import-line">
        <label htmlFor={`${ids}-run`} className="prompt">Session or run files</label>
        <input id={`${ids}-run`} type="file" multiple accept=".jsonl,.json,application/x-ndjson" disabled={busy} onChange={(e) => pick(e.target, onFiles)} />
      </div>
      {canAddFolder && (
        <div className="import-line">
          <label htmlFor={`${ids}-dir`} className="prompt">Add a subagents folder</label>
          <input id={`${ids}-dir`} type="file" {...{ webkitdirectory: '' }} disabled={busy} onChange={(e) => pick(e.target, onFolder)} />
        </div>
      )}
    </>
  );
}

function Problems({ error }: { error: Failure }) {
  return (
    <DismissibleError className="tone-red">
      <p>{error.message}</p>
      {error.diagnostics.length > 0 && (
        <ul aria-label="Problems in the file">
          {error.diagnostics.map((d, i) => (
            <li key={i}>
              <code>{d.path}</code> — {d.message}
            </li>
          ))}
        </ul>
      )}
    </DismissibleError>
  );
}

function LeftOut({ left, onOpen }: { left: Left; onOpen: () => void }) {
  return (
    <div role="status" className="import-dropped">
      <ul aria-label="About the run's team">
        {left.warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
      <Btn onClick={onOpen}>Open {left.name}</Btn>
    </div>
  );
}

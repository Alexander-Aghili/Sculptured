import { compactNumber, plural } from '../format';
import { Btn } from '../shell/ui';

export type SessionFound = {
  source: 'imported:claude-code' | 'imported:codex';
  agents: number;
  subagents: number;
  started_ms: number;
  ended_ms: number | null;
  tokens: { input: number; output: number; cache_read: number; cache_write: number };
  missing: string[];
  unknown_lines: number;
};

/** What `/api/runs/convert` found, and the run file to import once the person agrees. */
export type Converted = { preview: SessionFound; warnings: string[]; session: string };

/** "2 h 14 min", "6 min", "40 s". */
function length(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min >= 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return min >= 1 ? `${min} min` : `${Math.round(ms / 1000)} s`;
}

/** The one-line summary of a converted session. */
export function sessionSummary(p: SessionFound): string {
  const tool = p.source === 'imported:codex' ? 'Codex' : 'Claude Code';
  const t = p.tokens.input + p.tokens.output + p.tokens.cache_read + p.tokens.cache_write;
  const span = p.ended_ms === null ? '' : ` · ${length(p.ended_ms - p.started_ms)}`;
  return `${tool} session · 1 main agent, ${plural(p.subagents, 'subagent')}${span} · ${compactNumber(t)} tokens`;
}

/** Before anything is created: what the files hold, what is missing, and Import or Cancel. */
export function SessionPreview({ found, busy, onImport, onCancel }: { found: Converted; busy: boolean; onImport: () => void; onCancel: () => void }) {
  const p = found.preview;
  return (
    <div role="status" className="import-preview" aria-label="What the session holds">
      <p><strong>{sessionSummary(p)}</strong></p>
      {p.missing.length > 0 && (
        <>
          <p className="tone-amber">Not included:</p>
          <ul aria-label="Not included">{p.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}
      {found.warnings.length > 0 && <ul aria-label="Warnings">{found.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {p.unknown_lines > 0 && <p className="muted">{plural(p.unknown_lines, 'line')} Sculptured did not recognise were kept as raw evidence.</p>}
      <p className="muted">It opens in History, read-only, and as a team you can run.</p>
      <div className="import-actions">
        <Btn variant="primary" disabled={busy} onClick={onImport}>{p.missing.length > 0 ? 'Import anyway' : 'Import'}</Btn>
        <Btn disabled={busy} onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

import { Btn } from '../../shell/ui';
import { plural } from '../../format';
import type { Change, ChangeRow, Comparison } from './compare';
import { CHANGE_WORD } from './ChangeBadge';
import type { DesignAssistantState } from './useDesignAssistant';

export type Target = NonNullable<ChangeRow['target']>;

const SIGN: Record<Change, string> = { added: '+', changed: '~', removed: '−' };

/** "+2 new · ~1 changed · −1 removed", as pills. */
function Counts({ rows }: { rows: ChangeRow[] }) {
  const kinds: Change[] = ['added', 'changed', 'removed'];
  return (
    <span className="da-counts">
      {kinds.map((k) => {
        const n = rows.filter((r) => r.change === k).length;
        return n > 0 ? <span key={k} className={`change-badge change-${k}`}>{SIGN[k]}{n} {CHANGE_WORD[k].toLowerCase()}</span> : null;
      })}
    </span>
  );
}

type ReviewProps = { a: DesignAssistantState; comparison: Comparison; revisionChanged: boolean; onApprove: () => void; onInspect: (t: Target) => void };

/** The proposal: what changes, what can't be kept, and Approve or Reject. */
export function Review({ a, comparison, revisionChanged, onApprove, onInspect }: ReviewProps) {
  const rows = comparison.rows;
  const p = a.proposal!;
  return (
    <div className="da-review" role="group" aria-label="Proposal">
      <div className="da-review-head">
        <strong>Proposal</strong>
        {rows.length === 0 ? <span className="muted">no changes</span> : <Counts rows={rows} />}
      </div>
      <p className="muted da-review-note">Shown on the board. Nothing is saved until you approve.</p>
      <ChangeList rows={rows} onInspect={onInspect} />
      {p.dropped.length > 0 && (
        <details className="da-dropped">
          <summary>{plural(p.dropped.length, 'part')} Sculptured can't keep</summary>
          <ul aria-label="Not kept">{p.dropped.map((d, i) => <li key={i}><code>{d.path}</code> {d.message}</li>)}</ul>
        </details>
      )}
      {p.issues.length > 0 && <p className="tone-amber da-note">After approving, {plural(p.issues.length, 'thing')} will need fixing (listed under Things to fix).</p>}
      {revisionChanged && <p className="tone-amber da-note" role="note">The design changed since you asked. Approving replaces those changes with the proposal.</p>}
      <div className="da-decide">
        <Btn variant="primary" icon="check" disabled={a.busy} onClick={onApprove}>Approve</Btn>
        <Btn icon="x" disabled={a.busy} onClick={() => a.end('rejected')}>Reject</Btn>
      </div>
    </div>
  );
}

function ChangeList({ rows, onInspect }: { rows: ChangeRow[]; onInspect: (t: Target) => void }) {
  if (rows.length === 0) return <p className="muted">The assistant proposed no changes.</p>;
  return (
    <ul className="da-changes" aria-label="Proposed changes">
      {rows.map((r, i) => (
        <li key={i} className={`da-change da-change-${r.change}`}>
          <span className={`change-badge change-${r.change}`}>{CHANGE_WORD[r.change]}</span>{' '}
          <span className="da-change-what">
            {r.target ? <button type="button" className="link-btn" onClick={() => onInspect(r.target!)}>{r.what}</button> : r.what}
            {r.details.length > 0 && <span className="muted"> — {r.details.join(', ')}</span>}
          </span>
          {r.before && r.details.includes('job') && <JobCompare before={r.before.job} after={r.after?.job ?? ''} />}
        </li>
      ))}
    </ul>
  );
}

function JobCompare({ before, after }: { before: string; after: string }) {
  return (
    <details className="da-job">
      <summary>Compare the job</summary>
      <div className="da-job-grid">
        <div><span className="muted">Saved</span><pre>{before || '(empty)'}</pre></div>
        <div><span className="muted">Proposed</span><pre>{after || '(empty)'}</pre></div>
      </div>
    </details>
  );
}

/** Above the board while a proposal is shown: what you are looking at, and the two ways out. */
export function ProposalBar({ a, comparison, onApprove }: { a: DesignAssistantState; comparison: Comparison; onApprove: () => void }) {
  return (
    <div className="proposal-bar" role="region" aria-label="Proposal shown on the board">
      <p>
        <strong>Showing the design assistant's proposal</strong> · {comparison.rows.length === 0 ? 'no changes' : plural(comparison.rows.length, 'change')}. The saved design is unchanged until you approve.
      </p>
      <Btn size="sm" variant="primary" icon="check" disabled={a.busy} onClick={onApprove}>Approve</Btn>
      <Btn size="sm" icon="x" disabled={a.busy} onClick={() => a.end('rejected')}>Reject</Btn>
    </div>
  );
}

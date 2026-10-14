import { useId, useState } from 'react';
import { Badge, Btn } from '../../shell/ui';
import { TextArea } from '../../shell/TextArea';
import { plural } from '../../format';
import type { Comparison, ChangeRow } from './compare';
import { CHANGE_WORD } from './ChangeBadge';
import { CLI_NAME, type Cli, type DesignAssistantState } from './useDesignAssistant';
import './assistant.css';

export type Target = NonNullable<ChangeRow['target']>;

type Props = {
  a: DesignAssistantState;
  revision: number;
  /** Why the design can't change now (the team is running), if it can't. */
  lockedReason: string | null;
  comparison: Comparison | null;
  onApprove: () => void;
  onInspect: (t: Target) => void;
};

/** The design assistant: ask for a change, inspect the proposal on the board, then approve, reject or keep going. */
export function DesignAssistant({ a, revision, lockedReason, comparison, onApprove, onInspect }: Props) {
  return (
    <section className="panel design-assistant" aria-label="Design assistant">
      <div className="panel-bar">
        <span className="panel-title">Design assistant</span>
        <span className="panel-rule" aria-hidden="true" />
        <Btn variant="ghost" size="sm" iconOnly icon="x" aria-label="Close the design assistant" disabled={!!a.proposal || a.busy} onClick={() => a.setOpen(false)} />
      </div>
      <div className="da-body">
        {a.turns.length === 0 && <Intro a={a} />}
        <Talk a={a} />
        {a.proposal && comparison && <Review a={a} comparison={comparison} revisionChanged={a.baseRevision !== null && a.baseRevision !== revision} onApprove={onApprove} onInspect={onInspect} />}
        <AskForm a={a} revision={revision} lockedReason={lockedReason} />
      </div>
    </section>
  );
}

function Intro({ a }: { a: DesignAssistantState }) {
  return (
    <>
      {a.outcome === 'approved' && <p className="tone-green" role="status">Approved: the proposal is now the design.</p>}
      {a.outcome === 'rejected' && <p className="muted" role="status">Rejected: the design is as it was.</p>}
      <p className="muted">
        Describe a change to this design. Your own {CLI_NAME[a.cli]} proposes it, and you see the proposal on the board before anything is saved. Approve it, reject it, or keep refining it.
      </p>
    </>
  );
}

function Talk({ a }: { a: DesignAssistantState }) {
  if (a.turns.length === 0) return null;
  return (
    <ol className="da-talk" aria-label="Conversation">
      {a.turns.map((t, i) => (
        <li key={i} className={`da-turn da-${t.role}`}>
          <span className="da-who">{t.role === 'person' ? 'You' : CLI_NAME[a.cli]}</span>
          {t.role === 'assistant' && <Badge tone="neutral">AI proposal</Badge>}
          <p>{t.text}</p>
        </li>
      ))}
    </ol>
  );
}

function Review({ a, comparison, revisionChanged, onApprove, onInspect }: { a: DesignAssistantState; comparison: Comparison; revisionChanged: boolean; onApprove: () => void; onInspect: (t: Target) => void }) {
  const rows = comparison.rows;
  const p = a.proposal!;
  return (
    <div className="da-review" role="group" aria-label="Proposal">
      <p className="da-review-head">
        <strong>Proposal</strong> · {rows.length === 0 ? 'no changes' : plural(rows.length, 'change')} · shown on the board. Nothing is saved until you approve.
      </p>
      <ChangeList rows={rows} onInspect={onInspect} />
      {p.dropped.length > 0 && (
        <details className="da-dropped">
          <summary>{plural(p.dropped.length, 'part')} Sculptured can't keep</summary>
          <ul aria-label="Not kept">{p.dropped.map((d, i) => <li key={i}><code>{d.path}</code> {d.message}</li>)}</ul>
        </details>
      )}
      {p.issues.length > 0 && <p className="tone-amber">The proposal has {plural(p.issues.length, 'thing')} to fix after approving.</p>}
      {revisionChanged && <p className="tone-amber" role="note">The design changed since you asked. Approving replaces those changes with the proposal.</p>}
      <div className="import-actions">
        <Btn variant="primary" disabled={a.busy} onClick={onApprove}>Approve</Btn>
        <Btn disabled={a.busy} onClick={() => a.end('rejected')}>Reject</Btn>
      </div>
    </div>
  );
}

function ChangeList({ rows, onInspect }: { rows: ChangeRow[]; onInspect: (t: Target) => void }) {
  if (rows.length === 0) return <p className="muted">The assistant proposed no changes.</p>;
  return (
    <ul className="da-changes" aria-label="Proposed changes">
      {rows.map((r, i) => (
        <li key={i}>
          <span className={`change-badge change-${r.change}`}>{CHANGE_WORD[r.change]}</span>{' '}
          {r.target ? <button type="button" className="link-btn" onClick={() => onInspect(r.target!)}>{r.what}</button> : r.what}
          {r.details.length > 0 && <span className="muted"> — {r.details.join(', ')}</span>}
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

function AskForm({ a, revision, lockedReason }: { a: DesignAssistantState; revision: number; lockedReason: string | null }) {
  const ids = useId();
  const [text, setText] = useState('');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || a.busy || lockedReason) return;
    if (await a.ask(text.trim(), revision)) setText('');
  };
  return (
    <form className="da-ask" onSubmit={(e) => void send(e)}>
      <label htmlFor={`${ids}-text`}>{a.proposal ? 'Refine the proposal' : 'What should change?'}</label>
      <TextArea id={`${ids}-text`} rows={3} value={text} disabled={a.busy || !!lockedReason} placeholder="e.g. Add a tester after the builder, and make the planner's job more specific" onChange={(e) => setText(e.target.value)} />
      <div className="da-ask-row">
        <label>
          Ask{' '}
          <select value={a.cli} disabled={a.busy || a.turns.length > 0} onChange={(e) => a.setCli(e.target.value as Cli)}>
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <Btn type="submit" variant={a.proposal ? undefined : 'primary'} icon="send" disabled={a.busy || !text.trim() || !!lockedReason}>{a.proposal ? 'Send' : 'Ask'}</Btn>
      </div>
      {lockedReason && <p className="muted">{lockedReason}</p>}
      {a.busy && <p role="status">Asking {CLI_NAME[a.cli]}… this usually takes under a minute.</p>}
      {a.error && <p className="tone-red" role="alert">{a.error}</p>}
    </form>
  );
}

/** Above the board while a proposal is shown: what you are looking at, and the two ways out. */
export function ProposalBar({ a, comparison, onApprove }: { a: DesignAssistantState; comparison: Comparison; onApprove: () => void }) {
  const n = comparison.rows.length;
  return (
    <div className="proposal-bar" role="region" aria-label="Proposal shown on the board">
      <p>
        <strong>Showing the design assistant's proposal</strong> · {n === 0 ? 'no changes' : plural(n, 'change')}. The saved design is unchanged until you approve.
      </p>
      <Btn size="sm" variant="primary" disabled={a.busy} onClick={onApprove}>Approve</Btn>
      <Btn size="sm" disabled={a.busy} onClick={() => a.end('rejected')}>Reject</Btn>
    </div>
  );
}

import { useId, useState } from 'react';
import { Badge, Btn } from '../../shell/ui';
import { Icon } from '../../shell/icons';
import { TextArea } from '../../shell/TextArea';
import type { Comparison } from './compare';
import { Review, type Target } from './Review';
import { WorkingCard } from './Working';
import { CLI_NAME, type Cli, type DesignAssistantState } from './useDesignAssistant';
import './assistant.css';

export { ProposalBar } from './Review';
export { WorkingBar } from './Working';
export type { Target } from './Review';

type Props = {
  a: DesignAssistantState;
  revision: number;
  /** Why the design can't change now (the team is running), if it can't. */
  lockedReason: string | null;
  comparison: Comparison | null;
  onApprove: () => void;
  onInspect: (t: Target) => void;
};

const SUGGESTIONS = [
  'Add a reviewer after each builder',
  'Split the agent with the biggest job into two',
  'Add an agent that assembles everyone’s output at the end',
];

/** The design assistant: ask for a change, inspect the proposal on the board, then approve, reject or keep going. */
export function DesignAssistant({ a, revision, lockedReason, comparison, onApprove, onInspect }: Props) {
  const [draft, setDraft] = useState('');
  return (
    <section className="panel design-assistant" aria-label="Design assistant">
      <header className="da-head">
        <span className="da-avatar" aria-hidden="true"><Icon name="bot" size={16} /></span>
        <span className="da-title">
          <strong>Design assistant</strong>
          <span className="muted">Changes are proposals until you approve them</span>
        </span>
        <Btn variant="ghost" size="sm" iconOnly icon="x" aria-label="Close the design assistant" disabled={!!a.proposal || a.busy} onClick={() => a.setOpen(false)} />
      </header>
      <div className="da-body">
        <Outcome a={a} />
        {a.turns.length === 0 && !a.busy && <Intro a={a} onPick={setDraft} />}
        <Talk a={a} />
        {a.busy && <WorkingCard a={a} />}
        {a.proposal && comparison && !a.busy && <Review a={a} comparison={comparison} revisionChanged={a.baseRevision !== null && a.baseRevision !== revision} onApprove={onApprove} onInspect={onInspect} />}
      </div>
      <Composer a={a} revision={revision} lockedReason={lockedReason} text={draft} setText={setDraft} />
    </section>
  );
}

function Outcome({ a }: { a: DesignAssistantState }) {
  if (a.outcome === 'approved') return <p className="da-outcome tone-green" role="status"><Icon name="check" size={14} /> Approved: the proposal is now the design.</p>;
  if (a.outcome === 'rejected') return <p className="da-outcome muted" role="status"><Icon name="undo" size={14} /> Rejected: the design is as it was.</p>;
  return null;
}

function Intro({ a, onPick }: { a: DesignAssistantState; onPick: (s: string) => void }) {
  return (
    <div className="da-intro">
      <p>Describe a change to this design. Your own {CLI_NAME[a.cli]} proposes it, and you see the proposal on the board before anything is saved.</p>
      <div className="da-suggest" role="group" aria-label="Suggestions">
        {SUGGESTIONS.map((s) => <button key={s} type="button" className="da-chip" onClick={() => onPick(s)}>{s}</button>)}
      </div>
    </div>
  );
}

function Talk({ a }: { a: DesignAssistantState }) {
  if (a.turns.length === 0) return null;
  return (
    <ol className="da-talk" aria-label="Conversation">
      {a.turns.map((t, i) => (
        <li key={i} className={`da-turn da-${t.role}`}>
          {t.role === 'assistant' && <span className="da-who">{CLI_NAME[a.cli]} <Badge tone="neutral">AI proposal</Badge></span>}
          <p>{t.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Enter sends; Shift+Enter, or Enter while an input method is composing, does not. */
function enterSends(send: () => void) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
}

type ComposerProps = { a: DesignAssistantState; revision: number; lockedReason: string | null; text: string; setText: (s: string) => void };

/** The message box, pinned to the bottom: Enter sends, Shift+Enter adds a line. */
function Composer({ a, revision, lockedReason, text, setText }: ComposerProps) {
  const ids = useId();
  const blocked = a.busy || !!lockedReason;
  // The box clears as the message goes, and gets it back if the request fails.
  const send = async () => {
    const t = text.trim();
    if (!t || blocked) return;
    setText('');
    if (!(await a.ask(t, revision))) setText(t);
  };
  const onKey = enterSends(() => void send());
  return (
    <form className="da-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <label htmlFor={`${ids}-text`} className="sr-only">{a.proposal ? 'Refine the proposal' : 'What should change?'}</label>
      <TextArea id={`${ids}-text`} rows={3} value={text} disabled={blocked} onKeyDown={onKey}
        placeholder={a.proposal ? 'Refine the proposal, e.g. “call the tester QA”. Enter sends; Shift+Enter adds a line.' : 'What should change? e.g. “add a tester after the builder”. Enter sends; Shift+Enter adds a line.'} onChange={(e) => setText(e.target.value)} />
      <div className="da-composer-row">
        <select aria-label="Who answers" className="da-cli" value={a.cli} disabled={a.busy || a.turns.length > 0} onChange={(e) => a.setCli(e.target.value as Cli)}>
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
        <span className="da-spacer" />
        <Btn type="submit" variant="primary" icon="send" disabled={blocked || !text.trim()}>{a.proposal ? 'Send' : 'Ask'}</Btn>
      </div>
      {lockedReason && <p className="muted">{lockedReason}</p>}
      {a.error && <p className="tone-red" role="alert">{a.error}</p>}
    </form>
  );
}

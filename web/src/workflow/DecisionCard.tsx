import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import { DismissibleError } from '../shell/DismissibleError';
import type { WorkflowRun } from '../generated/WorkflowRun';
import type { WorkflowTask } from '../generated/WorkflowTask';
import type { WorkflowStep } from '../generated/WorkflowStep';

/** Who settled a step, in words: an agent's report is not verification. */
export function provenance(h: WorkflowStep): string {
  return h.by === 'check' ? 'verified check' : h.by === 'person' ? "person's decision" : h.by === 'sculptured' ? 'Sculptured' : 'agent-reported';
}

/** An item waiting at a human stage: the question, the latest evidence, one button per outcome. */
export function DecisionCard({ t, run, onDecided, logOn = false }: { t: WorkflowTask; run: WorkflowRun; onDecided: () => void; logOn?: boolean }) {
  const stage = run.config.stages.find(s => s.id === t.stage);
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [log, setLog] = useState(false);
  if (!stage) return null;
  const decide = async (outcome: string) => {
    setBusy(true);
    try { await api.decideWorkflow(run.rig, { task: t.input.id, outcome, note, start_seq: run.start_seq, log: logOn && log }); setError(''); onDecided(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <section className="decision-card" aria-label={`${t.input.title}: ${stage.name}`}>
    <h3>{t.input.title} <span className="muted">· waiting at {stage.name} since {new Date(t.waiting?.since_ms ?? 0).toLocaleTimeString()}</span></h3>
    <p className="decision-prompt">{stage.prompt}</p>
    <ol className="decision-evidence">{t.history.slice(-3).map(h => <li key={h.assignment}><strong>{h.stage} → {h.outcome}</strong> · {provenance(h)}{h.evidence ? <pre>{h.evidence}</pre> : <p>{h.result}</p>}</li>)}</ol>
    <label>Note (optional)<textarea value={note} maxLength={4096} onChange={e => setNote(e.target.value)} /></label>
    {logOn && <label className="decision-log-tick"><input type="checkbox" checked={log} onChange={e => setLog(e.target.checked)} />Add this note to the decision log</label>}
    <div className="decision-outcomes">{Object.keys(stage.routes).map(o => <button key={o} className="btn" disabled={busy} onClick={() => void decide(o)}>{o}</button>)}</div>
    {error && <DismissibleError>{error}</DismissibleError>}
  </section>;
}

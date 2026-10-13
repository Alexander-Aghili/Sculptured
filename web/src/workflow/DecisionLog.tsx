import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import { DismissibleError } from '../shell/DismissibleError';
import { usePolled } from '../usePolling';

/** The team's decision log: precedents people write, which agents read (read_decisions). Hiding keeps the entry. */
export function DecisionLog({ team }: { team: string }) {
  const { data, reload } = usePolled(() => api.decisions(team), 10000, [team]);
  const [text, setText] = useState(''), [error, setError] = useState(''), [hiding, setHiding] = useState<string | null>(null);
  const act = async (f: () => Promise<unknown>) => { try { await f(); setError(''); reload(); } catch (e) { setError(errorText(e)); } };
  return <section className="decision-log" aria-label="Decision log">
    <h3>Decision log</h3>
    <p className="muted">Precedents for the team. Agents read them with read_decisions; only people write them.</p>
    <ol>{(data ?? []).map((e) => <li key={e.id}>
      <p>{e.text}</p>
      <small className="muted">{e.author} · {e.source === 'decision' ? 'from a decision' : 'written'} · {new Date(e.at_ms).toLocaleString()}</small>
      {hiding === e.id
        ? <button className="link-btn" aria-label={`Confirm hiding: ${e.text.slice(0, 60)}`} onClick={() => void act(async () => { await api.hideDecision(team, e.id); setHiding(null); })}>Hide it (agents stop seeing it)</button>
        : <button className="link-btn" aria-label={`Hide: ${e.text.slice(0, 60)}`} onClick={() => setHiding(e.id)}>Hide</button>}
    </li>)}</ol>
    <label>New entry <textarea value={text} maxLength={4096} onChange={(e) => setText(e.target.value)} /></label>
    <button className="btn" disabled={!text.trim()} onClick={() => void act(async () => { await api.addDecision(team, text.trim()); setText(''); })}>Add to the log</button>
    {error && <DismissibleError>{error}</DismissibleError>}
  </section>;
}

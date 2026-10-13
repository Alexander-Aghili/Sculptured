import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import type { AgentCopies } from '../generated/AgentCopies';
import { Btn } from '../shell/ui';

/** Each agent's own git copy (when the team gives agents their own copies): what it has that the
 *  project does not, and Merge / Remove. Merging commits the copy's uncommitted work on its branch first. */
export function AgentCopiesList({ team, onMerged }: { team: string; onMerged: () => void }) {
  const [data, setData] = useState<AgentCopies | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api.copies(team).then(setData, (e) => setError(errorText(e))), [team]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: 'merge' | 'remove', seat: string) => {
    setBusy(seat); setError('');
    try { setData(await api.copyAction(team, action, seat)); if (action === 'merge') onMerged(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(''); }
  };
  if (!data || (!data.enabled && !data.copies.length)) return null;
  const agent = (branch: string) => branch.split('/').at(-1);
  return (
    <section className="agent-copies" aria-label="Agent copies">
      <h2>Agent copies</h2>
      <p className="muted">
        {data.enabled ? 'Each agent works in its own copy, on its own branch.' : 'Own copies are off; these copies remain from before.'}{' '}
        Merge brings an agent's work into <strong>{data.into || 'the current branch'}</strong>; its uncommitted changes are committed on its branch first. Remove deletes the copy's folder and keeps its branch.
      </p>
      {error && <p className="tone-red" role="alert">{error}</p>}
      {!data.copies.length && <p className="muted">No copies yet: agents get one when they start.</p>}
      <ul>
        {data.copies.map((c) => (
          <li key={c.seat}>
            <strong>{agent(c.branch)}</strong> <code>{c.branch}</code>
            <span className="muted"> · {c.ahead} commit{c.ahead === 1 ? '' : 's'} to merge · {c.uncommitted} uncommitted file{c.uncommitted === 1 ? '' : 's'}{c.running ? ' · running' : ''}</span>
            <span className="agent-copy-actions">
              <Btn size="sm" disabled={c.running || !!busy || (c.ahead === 0 && c.uncommitted === 0)} onClick={() => act('merge', c.seat)} tip={c.running ? 'Stop this agent first' : undefined}>Merge</Btn>
              <Btn size="sm" disabled={c.running || !!busy || c.uncommitted > 0} onClick={() => act('remove', c.seat)} tip={c.uncommitted > 0 ? 'Merge first: it has uncommitted work' : undefined}>Remove copy</Btn>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { gw } from './session';

type Instance = { user: string; name: string | null; email: string | null; idle_seconds: number; computer_connected: boolean };

const idle = (s: number) => s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;

/** Each user's Sculptured running on the server right now. Stopping asks once more, in place. */
export function AdminRunning() {
  const [list, setList] = useState<Instance[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { gw<Instance[]>('GET', '/admin/instances').then(setList, (e) => setError((e as Error).message)); }, []);
  useEffect(load, [load]);
  const stop = async (i: Instance) => {
    setError('');
    try { await gw('POST', `/admin/instances/${i.user}/stop`); setAsking(null); load(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <section aria-label="Running now">
      <h2>Running now</h2>
      <p className="muted">One Sculptured per signed-in user runs on the server; it stops by itself after 30 idle minutes unless a computer is connected.</p>
      {error && <p className="tone-red" role="alert">{error}</p>}
      {list.length === 0 ? <p>Nobody's Sculptured is running.</p> :
        <table><thead><tr><th>User</th><th>Last request</th><th>Computer</th><th /></tr></thead><tbody>
          {list.map((i) => <InstanceRow key={i.user} i={i} asking={asking === i.user} onAsk={setAsking} onStop={() => void stop(i)} />)}
        </tbody></table>}
    </section>
  );
}

function InstanceRow({ i, asking, onAsk, onStop }: { i: Instance; asking: boolean; onAsk: (user: string | null) => void; onStop: () => void }) {
  const who = i.name ?? i.email ?? 'Unknown user';
  return (
    <tr>
      <td>{who}{i.email && i.name ? ` · ${i.email}` : ''}</td><td>{idle(i.idle_seconds)}</td><td>{i.computer_connected ? 'computer connected' : 'none'}</td>
      <td>{asking
        ? <span className="admin-confirm">Their page reloads; agents on their computer keep running.{' '}
            <button className="btn btn-danger" onClick={onStop}>Stop {who} now</button>{' '}
            <button className="btn" onClick={() => onAsk(null)}>Cancel</button></span>
        : <button className="btn" onClick={() => onAsk(i.user)}>Stop</button>}</td>
    </tr>
  );
}

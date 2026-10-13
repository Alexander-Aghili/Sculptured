import { useEffect, useState } from 'react';
import { gw } from './session';

type Entry = { id: number; at: string; action: string; detail: Record<string, unknown>; admin_email: string | null; target_email: string | null };

/** Every admin action in plain words. Unknown actions show their code word rather than a guess. */
function words(e: Entry): string {
  const who = e.target_email ?? 'a user';
  switch (e.action) {
    case 'invite.created': return e.detail.admin ? 'created an admin invite' : 'created an invite';
    case 'invite.revoked': return 'revoked an invite';
    case 'user.reset_link_made': return `made a reset link for ${who}`;
    case 'user.disabled': return `disabled ${who}`;
    case 'user.enabled': return `enabled ${who}`;
    case 'user.admin_granted': return `made ${who} an admin`;
    case 'user.admin_removed': return `removed ${who}'s admin rights`;
    case 'user.signed_out': return `signed ${who} out everywhere`;
    case 'device.revoked': return `revoked a computer of ${who}`;
    case 'instance.stopped': return `stopped ${who}'s Sculptured`;
    case 'ops.signed_in': return 'opened the ops tools';
    default: return e.action;
  }
}

export function AdminAudit() {
  const [list, setList] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { gw<Entry[]>('GET', '/admin/audit').then(setList, (e) => setError((e as Error).message)); }, []);
  return (
    <section aria-label="Audit log">
      <h2>Audit log</h2>
      <p className="muted">Every admin action, newest first (the latest 500).</p>
      {error && <p className="tone-red" role="alert">{error}</p>}
      <table aria-label="Admin actions"><thead><tr><th>When</th><th>Admin</th><th>What</th></tr></thead><tbody>
        {list.map((e) => <tr key={e.id}><td>{new Date(e.at).toLocaleString()}</td><td>{e.admin_email ?? 'a removed admin'}</td><td>{words(e)}</td></tr>)}
      </tbody></table>
    </section>
  );
}

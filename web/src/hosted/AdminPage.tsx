import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { gw } from './session';
import { AdminAnalytics } from './AdminAnalytics';
import './hosted.css';

type Invite = { id: string; kind: string; role: string; name: string; email: string | null; note: string | null; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null };
type User = { id: string; name: string; email: string; role: string; created_at: string; disabled_at: string | null; last_seen: string | null; providers: string[] };

const state = (i: Invite) => i.revoked_at ? 'revoked' : i.used_at ? `used ${new Date(i.used_at).toLocaleDateString()}` : new Date(i.expires_at) < new Date() ? 'expired' : `open until ${new Date(i.expires_at).toLocaleDateString()}`;

export function AdminPage(_: { csrf?: string }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: '', email: '', note: '', days: 14, admin: false });
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'people' | 'analytics'>('people');
  const load = useCallback(() => {
    gw<Invite[]>('GET', '/admin/invites').then(setInvites, (e) => setError(e.message));
    gw<User[]>('GET', '/admin/users').then(setUsers, (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const act = (fn: () => Promise<unknown>) => async () => { setError(''); try { await fn(); load(); } catch (e) { setError((e as Error).message); } };
  const create = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const r = await gw<{ link: string }>('POST', '/admin/invites', { ...form, email: form.email || null, note: form.note || null });
      setMade(r.link); setForm({ name: '', email: '', note: '', days: 14, admin: false }); load();
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <main className="hosted-page hosted-admin">
      <h1>Beta admin</h1>
      <div role="tablist" aria-label="Admin" className="an-tabs">
        <button role="tab" aria-selected={view === 'people'} className={`btn${view === 'people' ? ' is-on' : ''}`} onClick={() => setView('people')}>People &amp; invites</button>
        <button role="tab" aria-selected={view === 'analytics'} className={`btn${view === 'analytics' ? ' is-on' : ''}`} onClick={() => setView('analytics')}>Analytics</button>
      </div>
      {view === 'analytics' ? <AdminAnalytics /> : <>
      {error && <p className="tone-red" role="alert">{error}</p>}
      <section aria-label="New invite">
        <h2>Invite someone</h2>
        <form onSubmit={create} className="hosted-form inline">
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
          <label>Email (optional)<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Note (optional)<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} /></label>
          <label>Valid for (days)<input type="number" min={1} max={90} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.checked })} /> Admin</label>
          <button className="btn btn-primary">Create invite link</button>
        </form>
        {made && <p className="hosted-link"><code>{made}</code> <button className="btn" onClick={() => void navigator.clipboard?.writeText(made)}>Copy</button> <span className="muted">This link is shown only now; send it to the person.</span></p>}
      </section>
      <section aria-label="Invites">
        <h2>Invites</h2>
        <table><thead><tr><th>For</th><th>Kind</th><th>Status</th><th>Note</th><th /></tr></thead><tbody>
          {invites.map((i) => <tr key={i.id}><td>{i.name}{i.email ? ` · ${i.email}` : ''}{i.role === 'admin' ? ' · admin' : ''}</td><td>{i.kind}</td><td>{state(i)}</td><td>{i.note}</td>
            <td>{!i.used_at && !i.revoked_at && <button className="btn" onClick={act(() => gw('POST', `/admin/invites/${i.id}/revoke`))}>Revoke</button>}</td></tr>)}
        </tbody></table>
      </section>
      <section aria-label="Users">
        <h2>Users</h2>
        <table><thead><tr><th>Name</th><th>Email</th><th>Signs in with</th><th>Joined</th><th>Last seen</th><th /></tr></thead><tbody>
          {users.map((u) => <tr key={u.id}><td>{u.name}{u.role === 'admin' ? ' · admin' : ''}{u.disabled_at ? ' · disabled' : ''}</td><td>{u.email}</td><td>{u.providers.join(', ')}</td>
            <td>{new Date(u.created_at).toLocaleDateString()}</td><td>{u.last_seen ? new Date(u.last_seen).toLocaleString() : '—'}</td>
            <td><button className="btn" onClick={act(async () => { const r = await gw<{ link: string }>('POST', `/admin/users/${u.id}/reset-link`); setMade(r.link); })}>Reset link</button>{' '}
              <button className="btn" onClick={act(() => gw('POST', `/admin/users/${u.id}/disable`, { disabled: !u.disabled_at }))}>{u.disabled_at ? 'Enable' : 'Disable'}</button></td></tr>)}
        </tbody></table>
      </section>
      </>}
    </main>
  );
}

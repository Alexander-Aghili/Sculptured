import { useCallback, useEffect, useState } from 'react';
import { gw } from './session';

export type JoinedVia = { kind: 'group' | 'personal'; slug: string | null; label: string };
export type User = { id: string; name: string; email: string; role: string; created_at: string; disabled_at: string | null; last_seen: string | null; providers: string[]; joined_via?: JoinedVia | null };

/** Which link someone joined through: a group link by its name and address, else a personal invite. */
const via = (v?: JoinedVia | null) => !v ? '—' : v.kind === 'group' ? `${v.label} (/join/${v.slug})` : 'Personal invite';
type Computer = { id: string; name: string; platform: string; created_at: string; last_seen: string | null; connected: boolean };

/** The people table: roles, sign-out, reset links, disabling, and each person's connected computers. */
export function AdminUsers({ users, act, onLink }: { users: User[]; act: (fn: () => Promise<unknown>) => () => void; onLink: (link: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label="Users">
      <h2>Users</h2>
      <table><thead><tr><th>Name</th><th>Email</th><th>Signs in with</th><th>Joined via</th><th>Joined</th><th>Last seen</th><th /></tr></thead><tbody>
        {users.map((u) => <UserRow key={u.id} u={u} act={act} onLink={onLink} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} />)}
      </tbody></table>
    </section>
  );
}

function UserRow({ u, act, onLink, open, onToggle }: { u: User; act: (fn: () => Promise<unknown>) => () => void; onLink: (link: string) => void; open: boolean; onToggle: () => void }) {
  const admin = u.role === 'admin';
  return (
    <>
      <tr>
        <td>{u.name}{admin ? ' · admin' : ''}{u.disabled_at ? ' · disabled' : ''}</td><td>{u.email}</td><td>{u.providers.join(', ')}</td><td>{via(u.joined_via)}</td>
        <td>{new Date(u.created_at).toLocaleDateString()}</td><td>{u.last_seen ? new Date(u.last_seen).toLocaleString() : '—'}</td>
        <td className="admin-actions">
          <button className="btn" aria-expanded={open} onClick={onToggle}>Computers</button>
          <button className="btn" onClick={act(() => gw('POST', `/admin/users/${u.id}/role`, { admin: !admin }))}>{admin ? 'Remove admin' : 'Make admin'}</button>
          <button className="btn" onClick={act(() => gw('POST', `/admin/users/${u.id}/sign-out`))}>Sign out everywhere</button>
          <button className="btn" onClick={act(async () => onLink((await gw<{ link: string }>('POST', `/admin/users/${u.id}/reset-link`)).link))}>Reset link</button>
          <button className="btn" onClick={act(() => gw('POST', `/admin/users/${u.id}/disable`, { disabled: !u.disabled_at }))}>{u.disabled_at ? 'Enable' : 'Disable'}</button>
        </td>
      </tr>
      {open && <tr><td colSpan={6}><Computers u={u} /></td></tr>}
    </>
  );
}

function Computers({ u }: { u: User }) {
  const [list, setList] = useState<Computer[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => gw<Computer[]>('GET', `/admin/users/${u.id}/devices`).then(setList, (e) => setError((e as Error).message)), [u.id]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p className="tone-red" role="alert">{error}</p>;
  if (list === null) return <p className="muted">Loading computers…</p>;
  if (list.length === 0) return <p className="muted">No connected computers.</p>;
  const revoke = (c: Computer) => async () => { setError(''); try { await gw('POST', `/admin/users/${u.id}/devices/${c.id}/revoke`); await load(); } catch (e) { setError((e as Error).message); } };
  return (
    <ul aria-label={`${u.name}'s computers`} className="admin-computers">
      {list.map((c) => <li key={c.id}>
        <span>{c.name} · {c.platform} · {c.connected ? 'connected now' : c.last_seen ? `last seen ${new Date(c.last_seen).toLocaleString()}` : 'never connected'}</span>{' '}
        <button className="btn" aria-label={`Revoke ${c.name}`} onClick={revoke(c)}>Revoke</button>
      </li>)}
    </ul>
  );
}

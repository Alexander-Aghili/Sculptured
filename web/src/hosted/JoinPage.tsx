import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { gw, GwError, providerHref, RECORDED } from './session';
import './hosted.css';

type Invite = { name: string; email: string | null; expires_at: string };
type Providers = { password: boolean; google: boolean; github: boolean };

export function JoinPage({ onSignedIn = () => window.location.assign('/') }: { onSignedIn?: () => void }) {
  const { token = '' } = useParams();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    gw<Invite>('GET', `/invite/${token}`).then((i) => { setInvite(i); setForm((f) => ({ ...f, name: i.name, email: i.email ?? '' })); }, (e: GwError) => setError(e.message));
    gw<Providers>('GET', '/providers').then(setProviders, () => setProviders({ password: true, google: false, github: false }));
  }, [token]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await gw('POST', `/join/${token}/password`, form); onSignedIn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const params = new URLSearchParams(window.location.search);
  return (
    <main className="hosted-page">
      <h1>Join the Sculptured beta</h1>
      {(error || params.get('error')) && <p className="tone-red" role="alert">{error || `Sign-in didn't finish (${params.get('error')}). Try again.`}</p>}
      {invite && (
        <>
          <p>Invite for {invite.name}{invite.email ? ` (${invite.email})` : ''} · valid until {new Date(invite.expires_at).toLocaleDateString()}.</p>
          <div className="hosted-providers">
            {providers?.google && <a className="btn" href={providerHref({ join: token }, 'google')}>Continue with Google</a>}
            {providers?.github && <a className="btn" href={providerHref({ join: token }, 'github')}>Continue with GitHub</a>}
          </div>
          <form onSubmit={submit} className="hosted-form">
            <p className="muted">Or create an account with a password</p>
            <label>Your name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={12} autoComplete="new-password" /></label>
            <button className="btn btn-primary" disabled={busy}>Create account</button>
          </form>
          <p className="hosted-recorded">{RECORDED} <a href="/what-we-record" target="_blank" rel="noreferrer">Everything we record</a></p>
        </>
      )}
    </main>
  );
}

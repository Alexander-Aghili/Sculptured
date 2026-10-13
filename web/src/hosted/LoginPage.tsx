import { useEffect, useState, type FormEvent } from 'react';
import { gw, providerHref } from './session';
import './hosted.css';

const WHY: Record<string, string> = { no_account: 'There is no account for that sign-in. You need an invite link first.', login_expired: 'That sign-in took too long or was opened in another browser. Try again.', account_disabled: 'This account is disabled.', email_unverified: 'Verify your email with Google or GitHub first.', cancelled: 'Sign-in was cancelled.', email_taken: 'That email already has an account. Sign in with the method you used before.', invite_used: 'That invite was already used or withdrawn. Ask for a new link.' };

export function LoginPage() {
  const [providers, setProviders] = useState({ password: true, google: false, github: false });
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(() => { const c = new URLSearchParams(window.location.search).get('error'); return c ? WHY[c] ?? 'Sign-in failed. Try again.' : ''; });
  useEffect(() => { gw<typeof providers>('GET', '/providers').then(setProviders, () => {}); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { await gw('POST', '/login/password', form); window.location.assign('/'); } catch (err) { setError((err as Error).message); }
  };
  return (
    <main className="hosted-page">
      <h1>Sign in to Sculptured</h1>
      {error && <p className="tone-red" role="alert">{error}</p>}
      <div className="hosted-providers">
        {providers.google && <a className="btn" href={providerHref('login', 'google')}>Continue with Google</a>}
        {providers.github && <a className="btn" href={providerHref('login', 'github')}>Continue with GitHub</a>}
      </div>
      <form onSubmit={submit} className="hosted-form">
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="username" /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="current-password" /></label>
        <button className="btn btn-primary">Sign in</button>
      </form>
      <p className="muted">Sculptured is in a private beta. You need a personal invite link to create an account.</p>
    </main>
  );
}

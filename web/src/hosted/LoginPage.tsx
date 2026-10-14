import { useEffect, useState, type FormEvent } from 'react';
import { gw } from './session';
import { AuthCard, ProviderButtons, type Providers } from './AuthLayout';
import './hosted.css';

const WHY: Record<string, string> = { no_account: 'There is no account for that sign-in. You need an invite link first.', login_expired: 'That sign-in took too long or was opened in another browser. Try again.', account_disabled: 'This account is disabled.', email_unverified: 'Verify your email with Google or GitHub first.', cancelled: 'Sign-in was cancelled.', email_taken: 'That email already has an account. Sign in with the method you used before.', invite_used: 'That invite was already used or withdrawn. Ask for a new link.' };

export function LoginPage() {
  const [providers, setProviders] = useState<Providers>({ password: true, google: false, github: false });
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => { const c = new URLSearchParams(window.location.search).get('error'); return c ? WHY[c] ?? 'Sign-in failed. Try again.' : ''; });
  useEffect(() => { gw<Providers>('GET', '/providers').then(setProviders, () => {}); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await gw('POST', '/login/password', form); window.location.assign('/'); } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <AuthCard title="Sign in to Sculptured" lead="Design, run and steer teams of coding agents.">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <ProviderButtons providers={providers} purpose="login" />
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="username" /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="current-password" /></label>
        <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-note">Sculptured is in private beta: creating an account needs a personal invite link. Forgot your password? Ask the person who invited you for a reset link.</p>
    </AuthCard>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { gw, GwError, RECORDED } from './session';
import { AuthCard, ProviderButtons, type Providers } from './AuthLayout';
import './hosted.css';

type Invite = { name: string; email: string | null; expires_at: string };
type Form = { name: string; email: string; password: string };

export function JoinPage({ onSignedIn = () => window.location.assign('/') }: { onSignedIn?: () => void }) {
  const { token = '' } = useParams();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form>({ name: '', email: '', password: '' });
  useEffect(() => {
    gw<Invite>('GET', `/invite/${token}`).then((i) => { setInvite(i); setForm((f) => ({ ...f, name: i.name, email: i.email ?? '' })); }, (e: GwError) => setError(e.message));
    gw<Providers>('GET', '/providers').then(setProviders, () => setProviders({ password: true, google: false, github: false }));
  }, [token]);
  const params = new URLSearchParams(window.location.search);
  const failed = error || (params.get('error') ? `Sign-in didn't finish (${params.get('error')}). Try again.` : '');
  return (
    <AuthCard title="Join the Sculptured beta" lead={invite ? `Invite for ${invite.name}${invite.email ? ` (${invite.email})` : ''} · valid until ${new Date(invite.expires_at).toLocaleDateString()}.` : undefined}>
      {failed && <p className="auth-error" role="alert">{failed}</p>}
      {invite && (
        <>
          <ProviderButtons providers={providers} purpose={{ join: token }} />
          <JoinForm token={token} form={form} setForm={setForm} setError={setError} onSignedIn={onSignedIn} />
          <p className="auth-note">{RECORDED}</p>
        </>
      )}
    </AuthCard>
  );
}

/** Create the account with a password instead of Google or GitHub. */
function JoinForm({ token, form, setForm, setError, onSignedIn }: { token: string; form: Form; setForm: (f: Form) => void; setError: (e: string) => void; onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await gw('POST', `/join/${token}/password`, form); onSignedIn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="auth-form">
      <label>Your name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
      <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
      <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={12} autoComplete="new-password" /></label>
      <button className="btn btn-primary auth-submit" disabled={busy}>Create account</button>
    </form>
  );
}

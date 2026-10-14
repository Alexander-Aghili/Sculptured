import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { gw } from './session';
import { AuthCard } from './AuthLayout';
import './hosted.css';

export function ResetPage() {
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    try { await gw('POST', `/reset/${token}/password`, { password }); window.location.assign('/'); } catch (err) { setError((err as Error).message); }
  };
  return (
    <AuthCard title="Choose a new password" lead="This signs you out everywhere else.">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <form onSubmit={submit} className="auth-form">
        <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} autoComplete="new-password" /></label>
        <button className="btn btn-primary auth-submit">Save and sign in</button>
      </form>
    </AuthCard>
  );
}

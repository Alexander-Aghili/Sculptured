import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { gw } from './session';
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
    <main className="hosted-page">
      <h1>Choose a new password</h1>
      {error && <p className="tone-red" role="alert">{error}</p>}
      <form onSubmit={submit} className="hosted-form">
        <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} autoComplete="new-password" /></label>
        <button className="btn btn-primary">Save and sign in</button>
      </form>
      <p className="muted">This signs you out everywhere else.</p>
    </main>
  );
}

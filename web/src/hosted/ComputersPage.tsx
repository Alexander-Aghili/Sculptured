import { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../usePolling';
import { api } from '../api';
import type { HostPolicyInfo } from '../generated/HostPolicyInfo';
import type { CliStatus } from '../generated/CliStatus';
import { gw } from './session';
import './hosted.css';

export type Computer = { id: string; name: string; platform: string; created_at: string; last_seen: string | null; connected: boolean };

export function ComputersPage() {
  const [list, setList] = useState<Computer[] | null>(null);
  const [policies, setPolicies] = useState<Record<string, HostPolicyInfo | null>>({});
  const [error, setError] = useState('');
  const load = useCallback(() => {
    gw<Computer[]>('GET', '/devices').then(setList, (e) => setError(e.message));
    api.hosts().then((hs) => setPolicies(Object.fromEntries(hs.map((h) => [h.id, h.policy]))), () => {});
  }, []);
  usePolling(load, 10000);
  const origin = window.location.origin;
  return (
    <main className="hosted-page hosted-admin">
      <h1>Computers</h1>
      <p className="muted">Your agents run on your own computers, with your own Claude Code and Codex sign-ins. Each computer decides which folders agents may use.</p>
      {error && <p className="tone-red" role="alert">{error}</p>}
      <ul className="computer-list">
        {(list ?? []).map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong> <span className="muted">{c.platform}</span>{' '}
            <span className={c.connected ? 'tone-green' : 'muted'}>{c.connected ? 'Connected' : c.last_seen ? `Last seen ${new Date(c.last_seen).toLocaleString()}` : 'Never connected'}</span>
            <button className="btn" aria-label={`Disconnect ${c.name}`} onClick={() => void gw('POST', `/devices/${c.id}/revoke`).then(load, (e) => setError(e.message))}>Disconnect</button>
            {c.connected && policies[c.id] && <ComputerDetails id={c.id} name={c.name} policy={policies[c.id]!} />}
          </li>
        ))}
      </ul>
      {list && list.length === 0 && <p>No computers yet.</p>}
      <section aria-label="Connect a computer">
        <h2>Connect a computer</h2>
        <p>On the computer (Linux, or a Mac with Apple silicon), run this in a terminal. It installs Sculptured for you (no admin rights), checks the download, and connects:</p>
        <pre className="hosted-cmd">{`curl -fsSL ${origin}/install.sh | sh -s -- --allow ~/projects`}</pre>
        <p className="muted">Already installed? Run <code>{`sculptured connect ${origin} --allow ~/projects`}</code>. Add <code>--install-service</code> to reconnect automatically when you log in. Allow more folders later with <code>sculptured allow &lt;folder&gt;</code>. Windows is coming later.</p>
      </section>
    </main>
  );
}

const CAPS: Record<string, string> = { git: 'Git', copies: "Agents' own copies", checks: 'Checks', cli_sign_in: 'Sign-in from the browser', plan_usage: 'Plan usage' };

/** What a connected computer allows, and its Claude Code / Codex sign-in, signed in from here. */
function ComputerDetails({ id, name, policy }: { id: string; name: string; policy: HostPolicyInfo }) {
  const [clis, setClis] = useState<CliStatus[] | null>(null);
  const [started, setStarted] = useState<Record<string, string | null>>({});
  const [error, setError] = useState('');
  useEffect(() => { api.clis(id).then(setClis, (e) => setError(e.message)); }, [id]);
  const signIn = async (cli: string) => {
    setError('');
    try { const s = await api.cliLogin(cli, id); setStarted((m) => ({ ...m, [cli]: s.url })); } catch (e) { setError((e as Error).message); }
  };
  const label = (n: string) => (n === 'claude' ? 'Claude' : 'Codex');
  return (
    <div className="computer-details">
      <p><strong>{policy.access === 'sandboxed' ? 'Sandboxed' : 'Full access'}</strong> <span className="muted">· agents start in:</span></p>
      <ul className="computer-folders">{policy.allowed_folders.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
      {policy.allowed_folders.length === 0 && <p className="tone-amber">No folders allowed yet: run <code>sculptured allow &lt;folder&gt;</code> on it.</p>}
      <p className="muted">Also allowed: {policy.capabilities.map((c) => CAPS[c] ?? c).join(', ') || 'nothing else'}.</p>
      {clis && (
        <ul className="computer-clis">
          {clis.map((c) => (
            <li key={c.name}>
              {label(c.name)}: {!c.installed ? 'not installed' : c.signed_in ? `signed in${c.account ? ` (${c.account})` : ''}` : 'not signed in'}
              {c.installed && c.signed_in !== true && policy.capabilities.includes('cli_sign_in') && (
                <button className="btn" aria-label={`Sign in to ${label(c.name)} on ${name}`} onClick={() => void signIn(c.name)}>Sign in</button>
              )}
              {started[c.name] && <a href={started[c.name]!} target="_blank" rel="noreferrer"> open the sign-in page</a>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="tone-red" role="alert">{error}</p>}
    </div>
  );
}

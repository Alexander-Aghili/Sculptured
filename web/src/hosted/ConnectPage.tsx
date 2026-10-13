import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { gw } from './session';
import './hosted.css';

export function ConnectPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  const [device, setDevice] = useState<{ name: string; platform: string; user_code: string; requested_at?: string; requested_from?: string } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const look = async (c: string) => { setError(''); setDevice(null); try { setDevice(await gw('GET', `/device/code/${encodeURIComponent(c)}`)); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { if (code) void look(code); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const allow = async () => { setError(''); try { await gw('POST', '/device/approve', { user_code: device!.user_code }); setDone(true); } catch (e) { setError((e as Error).message); } };
  return (
    <main className="hosted-page">
      <h1>Connect a computer</h1>
      {error && <p className="tone-red" role="alert">{error}</p>}
      {done ? <p>Connected. You can close this tab; the computer finishes on its own.</p> : device ? (
        <>
          <p>Allow ‘{device.name}’ ({device.platform}) to run agents for you?</p>
          <p className="tone-amber" role="note"><strong>Only approve a code you just saw on your own computer.</strong> If someone sent you this link, don't approve it: their computer would run your teams and see your work.</p>
          {device.requested_at && <p className="muted">Code requested {new Date(device.requested_at).toLocaleString()}{device.requested_from ? ` from ${device.requested_from}` : ''}.</p>}
          <p className="muted">It will run your teams' Claude Code, Codex and Practice agents there. Agents start in the folders that computer allows and, unless it was connected with <code>--sandboxed</code>, can act as you do on that computer. You can disconnect it any time from Computers.</p>
          <button className="btn btn-primary" onClick={() => void allow()}>Allow</button>
        </>
      ) : (
        <form className="hosted-form" onSubmit={(e) => { e.preventDefault(); void look(code); }}>
          <label>Code shown on the computer<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WXYZ-2345" autoComplete="off" /></label>
          <button className="btn btn-primary">Continue</button>
        </form>
      )}
    </main>
  );
}

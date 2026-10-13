import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHosted } from './HostedGate';
import { gw } from './session';
import { BackToApp } from './BackToApp';
import { AFTER_LOGIN } from './afterLogin';

/** `/ops`: the way into the ops tools (logs, database viewer). An admin goes straight on through a one-time
 * ticket; anyone else is told which account they are using and can switch to an admin one. Signed-out
 * visitors never get here: the sign-in screen comes first and brings them back. */
export function OpsPage() {
  const s = useHosted();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const admin = s.kind === 'signed-in' && s.user.role === 'admin';
  useEffect(() => {
    if (admin) window.location.assign(`/gw/api/admin/ops-ticket?next=${encodeURIComponent(next)}`);
  }, [admin, next]);
  if (admin) return <main className="hosted-page"><p className="muted">Opening the ops tools…</p></main>;
  const switchAccount = async () => {
    try { sessionStorage.setItem(AFTER_LOGIN, `/ops?next=${encodeURIComponent(next)}`); } catch { /* storage off: they land on home */ }
    await gw('POST', '/logout').catch(() => {});
    window.location.assign('/login');
  };
  return (
    <main className="hosted-page">
      <BackToApp />
      <h1>Ops tools are for admins</h1>
      <p>
        The logs and the database viewer are open to admins only.
        {s.kind === 'signed-in' && <> You're signed in as <strong>{s.user.email}</strong>, which isn't an admin.</>}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => void switchAccount()}>Sign in as an admin</button>
    </main>
  );
}

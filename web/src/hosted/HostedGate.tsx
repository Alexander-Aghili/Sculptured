import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { loadSession, type HostedSession } from './session';
import { routeTemplate, startAnalytics } from './analytics';

const Ctx = createContext<HostedSession>({ kind: 'local' });
export const useHosted = () => useContext(Ctx);
const OPEN = [/^\/join\//, /^\/reset\//, /^\/login$/, /^\/what-we-record$/];

export function HostedGate({ children }: { children: ReactNode }) {
  const [s, setS] = useState<HostedSession | null>(null);
  const [down, setDown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loc = useLocation();
  useEffect(() => { loadSession().then((x) => { setDown(false); setS(x); }, () => setDown(true)); }, [attempt]);
  // Hosted beta analytics, while signed in (local mode never starts it). See /what-we-record.
  const csrf = s?.kind === 'signed-in' ? s.csrf : null;
  useEffect(() => (csrf ? startAnalytics(csrf, () => routeTemplate(window.location.pathname)) : undefined), [csrf]);
  if (down) return (
    <main className="hosted-page" role="alert">
      <h1>Sculptured is not answering</h1>
      <p>This is usually brief. Your work is safe.</p>
      <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
    </main>
  );
  if (!s) return null;
  if (s.kind === 'signed-out' && !OPEN.some((r) => r.test(loc.pathname))) return <Navigate replace to="/login" />;
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}

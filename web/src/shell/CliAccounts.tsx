import { useCallback, useState } from 'react';
import { usePolling } from '../usePolling';
import { api } from '../api';
import { errorText } from '../errors';
import type { CliStatus } from '../generated/CliStatus';
import type { LoginStarted } from '../generated/LoginStarted';
import type { PlanUsageView } from '../generated/PlanUsageView';
import type { PlanWindow } from '../generated/PlanWindow';
import { Btn } from './ui';

const LABEL: Record<string, string> = { claude: 'Claude', codex: 'Codex' };
/** controld holds new work (team starts, subagents) from this percent (`plan_usage::HOLD_PERCENT`). */
const HOLD = 90;

function word(c: CliStatus): string {
  if (!c.installed) return 'not installed';
  if (c.signed_in === true) return c.account ? `signed in (${c.account})` : 'signed in';
  if (c.signed_in === false) return 'not signed in';
  return 'sign-in unknown';
}

const WINDOW: Record<string, string> = { five_hour: '5-hour', seven_day: 'weekly' };

function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

/** Windows that have not reset yet; a reset window's number no longer says anything. */
function live(u: PlanUsageView | undefined, now: number): PlanWindow[] {
  return (u?.usage.windows ?? []).filter((w) => w.resets_at === null || w.resets_at * 1000 > now);
}

function fullest(ws: PlanWindow[]): number | null {
  const ps = ws.map((w) => w.used_percent).filter((p): p is number => p !== null);
  return ps.length ? Math.max(...ps) : null;
}

const tone = (p: number | null) => (p === null ? '' : p >= HOLD ? 'tone-red' : p >= 70 ? 'tone-amber' : 'tone-green');

/** Whether this computer's Claude Code and Codex CLIs are signed in and how much of each plan is used
 *  (as the CLIs report it), with sign-in from the browser. The CLI runs its own sign-in (it opens the
 *  system browser); Sculptured stores no credentials. */
export function CliAccounts() {
  const [clis, setClis] = useState<CliStatus[] | null>(null);
  const [usage, setUsage] = useState<PlanUsageView[]>([]);
  const [started, setStarted] = useState<Record<string, LoginStarted>>({});
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void api.clis().then(setClis, () => setClis(null));
    void api.planUsage().then(setUsage, () => setUsage([]));
  }, []);
  const waiting = Object.keys(started).length > 0;
  usePolling(load, waiting ? 3000 : 60000);
  const signIn = async (name: string) => {
    setError(null);
    try {
      const s = await api.cliLogin(name);
      setStarted((m) => ({ ...m, [name]: s }));
    } catch (e) {
      setError(errorText(e));
    }
  };
  if (!clis) return null;
  const now = Date.now();
  const ready = clis.every((c) => c.signed_in === true);
  return (
    <details className="cli-accounts" data-ready={ready}>
      <summary>
        {clis.map((c) => {
          const p = fullest(live(usage.find((u) => u.usage.provider === c.name), now));
          const signed = c.signed_in === true;
          return (
            <span key={c.name} className={signed ? tone(p) || 'tone-green' : 'tone-amber'}>
              <span aria-hidden="true">{signed ? '● ' : '▲ '}</span>
              {LABEL[c.name] ?? c.name}
              {signed && p !== null && ` ${Math.round(p)}%`}{' '}
            </span>
          );
        })}
      </summary>
      <ul aria-label="Agent accounts">
        {clis.map((c) => {
          const u = usage.find((x) => x.usage.provider === c.name);
          const ws = live(u, now);
          return (
            <li key={c.name}>
              <strong>{LABEL[c.name] ?? c.name}</strong>: {word(c)}
              {c.version && <span className="muted"> · {c.version}</span>}
              {c.installed && c.signed_in !== true && (
                <>
                  {' '}
                  <Btn size="sm" onClick={() => signIn(c.name)}>Sign in</Btn>
                </>
              )}
              {started[c.name] && c.signed_in !== true && (
                <p>
                  Finish signing in in the browser window that opened.{' '}
                  {started[c.name].url ? <>If none opened, <a href={started[c.name].url!} target="_blank" rel="noreferrer">open the sign-in page</a>.</> : <span data-raw-evidence>{started[c.name].output}</span>}
                </p>
              )}
              <ul className="plan-windows" aria-label={`${LABEL[c.name] ?? c.name} plan usage`}>
                {!u && <li className="muted">Plan usage unknown: no {LABEL[c.name] ?? c.name} session has reported it yet.</li>}
                {ws.map((w) => (
                  <li key={w.name} className={tone(w.used_percent)}>
                    {WINDOW[w.name] ?? w.name.replace(/_/g, ' ')}: {w.used_percent === null ? 'unknown' : `${Math.round(w.used_percent)}% used`}
                    {w.resets_at !== null && <span className="muted"> · resets in {span(w.resets_at * 1000 - now)}</span>}
                    {w.used_percent !== null && w.used_percent >= HOLD && <> · new work held</>}
                  </li>
                ))}
                {u && ws.length === 0 && <li className="muted">Every reported window has reset since; waiting for a new report.</li>}
                {u?.usage.credits && <li>Credits: {u.usage.credits} (use past the limit spends them)</li>}
                {u && (
                  <li className="muted">
                    Reported by the CLI {span(now - u.observed_ms)} ago
                    {u.source === 'codex-session-files' ? ' (Codex session files; counts use outside Sculptured)' : ' in an agent session'}
                  </li>
                )}
              </ul>
            </li>
          );
        })}
      </ul>
      {error && <p className="tone-red" role="alert">{error}</p>}
    </details>
  );
}

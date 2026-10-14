import { useEffect, useState } from 'react';
import { CLI_NAME, type DesignAssistantState } from './useDesignAssistant';

/** Seconds since `since`, ticking once a second. */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** 75 → "1:15". */
export function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** In the panel while the CLI works: who is working, for how long, and that waiting is normal. */
export function WorkingCard({ a }: { a: DesignAssistantState }) {
  const s = useElapsed(a.since);
  const name = CLI_NAME[a.cli];
  return (
    <div className="da-working" role="status" aria-label="Design assistant progress">
      <div className="da-working-head">
        <span className="da-spinner" aria-hidden="true" />
        <strong>{name} is {a.proposal ? 'revising the proposal' : 'designing your change'}…</strong>
        <span className="da-clock">{clock(s)}</span>
      </div>
      <div className="da-progress" aria-hidden="true"><span /></div>
      <p className="muted">
        Big changes can take several minutes{s >= 240 ? '; Sculptured waits up to about 10 minutes' : ''}. You can keep looking around: nothing changes until you approve.
      </p>
    </div>
  );
}

/** Above the board while the CLI works, so the person knows from anywhere on the page. */
export function WorkingBar({ a }: { a: DesignAssistantState }) {
  const s = useElapsed(a.since);
  return (
    <div className="proposal-bar working" role="status" aria-label="Design assistant is working">
      <span className="da-spinner" aria-hidden="true" />
      <p>
        <strong>{CLI_NAME[a.cli]} is designing your change</strong> · {clock(s)}. The saved design stays as it is.
      </p>
    </div>
  );
}

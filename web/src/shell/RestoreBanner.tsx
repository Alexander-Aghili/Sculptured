import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import { plural } from '../format';
import type { RestoreDecision } from '../generated/RestoreDecision';
import type { SeatView } from '../generated/SeatView';
import { nameForId, type NameMap } from '../vocab';
import { Btn } from './ui';

/** The team's one answer after a restart: agents whose process ended wait here until the operator
 *  resumes them (their own conversation continues), starts them fresh, or leaves them stopped. */
export function RestoreBanner({ team, views, names }: { team: string; views: SeatView[]; names: NameMap }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = views.filter((v) => v.restore_offer);
  if (waiting.length === 0) return null;
  const resumable = waiting.filter((v) => v.restore_offer?.can_resume).length;
  const answer = async (decision: RestoreDecision) => {
    setBusy(true);
    setError(null);
    try {
      await api.restoreTeam(team, decision);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bar-note tone-amber restore-banner" role="region" aria-label="Agents waiting to resume">
      <p>
        <span aria-hidden="true">▲ </span>
        {plural(waiting.length, 'agent')} stopped mid-work. Resume {resumable === waiting.length ? 'them' : `${resumable} of them`} where they left off?
      </p>
      <ul>
        {waiting.map((v) => (
          <li key={v.id}>
            {nameForId(v.id, names)}: <span data-raw-evidence>{v.restore_offer?.reason}</span>
            {!v.restore_offer?.can_resume && ' (cannot be resumed; start it fresh or leave it stopped)'}
          </li>
        ))}
      </ul>
      <Btn variant="primary" disabled={busy || resumable === 0} onClick={() => answer('resume')}>Resume</Btn>{' '}
      <Btn disabled={busy} onClick={() => answer('fresh')}>Start fresh</Btn>{' '}
      <Btn disabled={busy} onClick={() => answer('leave')}>Leave stopped</Btn>
      {busy && <span role="status"> Working…</span>}
      {resumable === 0 && <span> None can be resumed: their conversations are unknown.</span>}
      {error && <p className="tone-red" role="alert">{error}</p>}
    </div>
  );
}

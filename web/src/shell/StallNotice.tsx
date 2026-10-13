import { useState } from 'react';
import { api, newRequestId } from '../api';
import { errorText } from '../errors';
import type { SeatView } from '../generated/SeatView';
import { Btn } from './ui';

export const NUDGE_TEXT =
  'You seem stuck: the same error keeps repeating. Stop, summarize what you have tried and why it failed, then try a different approach.';

/** A heuristic stall flag on a running agent, with the operator's choices. Nothing acts on its own. */
export function StallNotice({ seat }: { seat: SeatView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!seat.stalled || seat.lifecycle !== 'running') return null;
  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bar-note tone-amber stall-notice" role="region" aria-label="Agent may be stalled">
      <p>
        <span aria-hidden="true">▲ </span>Stalled (heuristic): <span data-raw-evidence>{seat.stalled.reason}</span>
      </p>
      <Btn disabled={busy} onClick={() => act(() => api.send(seat.id, { text: NUDGE_TEXT, intent: 'instruct', interrupt: true }))}>Nudge</Btn>{' '}
      <Btn disabled={busy} onClick={() => act(() => api.controlAgent(seat.id, 'soft', newRequestId()))}>Soft stop</Btn>
      {busy && <span role="status"> Working…</span>}
      {error && <p className="tone-red" role="alert">{error}</p>}
    </div>
  );
}

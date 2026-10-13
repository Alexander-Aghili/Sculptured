import { useEffect, useRef, useState } from 'react';
import { isRestartable } from '../status';
import { api } from '../api';
import { errorText } from '../errors';
import type { AgentRow } from './model';
import { Btn, StuckMark } from './ui';
import { plural } from '../format';


/**
 * The agent's handoff state and what you can do about it, in its pane header:
 * "▲ stuck: …" with **Restart this agent** (it needs attention, failed or stopped in a
 * running team), **Resend handoff** (a handoff never reached it) and **Hand over again**
 * (pass its latest finished turn on to the agents it hands work to, once each).
 */
export function HandoffActions({ a }: { a: AgentRow }) {
  const seat = a.seat;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);
  if (!seat) return null;
  const handsTo = a.handsTo ?? [];
  const canRestart = !!a.teamRunning && isRestartable(seat.lifecycle);
  const canResend = !!a.stuck?.can_resend && seat.lifecycle === 'running';
  const canHandOver = !!a.teamRunning && handsTo.length > 0 && seat.lifecycle === 'running';
  if (!a.stuck && !canRestart && !canResend && !canHandOver && !note) return null;

  const below = a.downstream ?? { count: handsTo.length, accounts: [] };
  const handOver = () => run(() => api.handOver(seat.id), `Handing over to ${handsTo.join(', ')}…`);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
      setNote({ text: done, error: false });
    } catch (e) {
      setNote({ text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="handoff-line">
      {a.stuck && <StuckMark reason={a.stuck.reason} />}
      <span className="handoff-actions" role="group" aria-label={`Handoffs of ${a.name}`}>
        {canRestart && (
          <Btn size="sm" icon="refresh" disabled={busy} onClick={() => run(() => api.restartSeat(seat.id), `Restarting ${a.name}…`)} tip="Relaunch only this agent; it then gets what it is owed">
            Restart this agent
          </Btn>
        )}
        {canResend && (
          <Btn size="sm" icon="send" disabled={busy} onClick={() => run(() => api.resendHandoffs(seat.id), 'Handoff sent again.')} tip="Send again what never reached this agent: a handoff, or its Job">
            Resend handoff
          </Btn>
        )}
        {canHandOver && (
          <Btn
            size="sm"
            icon="arrow-right"
            disabled={busy}
            // Real agents cost money: say how many will run before they do. Practice agents are free.
            onClick={() => (below.accounts.length > 0 ? setConfirming(true) : handOver())}
            tip={`Send ${a.name}'s latest finished turn to ${handsTo.join(', ')}; every agent downstream runs once`}
          >
            Hand over again
          </Btn>
        )}
      </span>
      {confirming && (
        <div
          className="handoff-confirm"
          role="alertdialog"
          aria-labelledby={`handover-q-${seat.id}`}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setConfirming(false);
          }}
        >
          <span id={`handover-q-${seat.id}`}>
            Re-run {plural(below.count, 'agent')} downstream of {a.name}? Each runs once and uses your {below.accounts.join(' and ')} account
            {below.accounts.length > 1 ? 's' : ''}.
          </span>
          <Btn ref={cancel} size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Btn>
          <Btn
            size="sm"
            variant="primary"
            onClick={() => {
              setConfirming(false);
              void handOver();
            }}
          >
            Re-run {plural(below.count, 'agent')}
          </Btn>
        </div>
      )}
      {note && (
        <span role="status" className={note.error ? 'tone-red' : 'muted'}>
          {note.text}
        </span>
      )}
    </div>
  );
}

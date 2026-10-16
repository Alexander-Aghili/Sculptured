import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import type { BudgetState } from '../generated/BudgetState';
import type { ContinueMode } from '../generated/ContinueMode';
import { Btn } from '../shell/ui';

type Paused = Extract<BudgetState, { state: 'paused' }>;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** The reason's first part (what was reached); the rest repeats what the banner says. */
const why = (reason: string) => `${reason.split(';')[0]}.`;
const day = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? '' : ` on ${new Date(ms).toLocaleDateString()}`);

/** A run paused at its plan budget: until when, and the person's choices while it waits. */
export function PausedRun({ rig, s, mode }: { rig: string; s: Paused; mode: ContinueMode | null }) {
  const [error, setError] = useState('');
  const act = (action: 'continue' | 'stop' | 'mode', m?: ContinueMode) => (m ? api.budgetPaused(rig, action, m) : api.budgetPaused(rig, action)).then(() => setError(''), (e) => setError(errorText(e)));
  return (
    <div className="run-budget-state tone-amber run-paused">
      <p role="status">Paused until {clock(s.until_ms)}{day(s.until_ms)}, when the plan window resets (window {s.window} of {s.max_windows}). {why(s.reason)}</p>
      <label><span>Continue</span>
        <select className="fld-input" aria-label="Continue" value={mode ?? 'notes'} onChange={(e) => act('mode', e.target.value as ContinueMode)}>
          <option value="notes">From their notes (fresh start)</option>
          <option value="resume">Resume their conversation</option>
        </select></label>
      <Btn onClick={() => act('continue')} tip="Start the agents again now; the run gets a new share of the window it is in">Continue now</Btn>
      <Btn onClick={() => act('stop')}>Stop</Btn>
      {error && <p role="alert" className="tone-red">{error}</p>}
    </div>
  );
}

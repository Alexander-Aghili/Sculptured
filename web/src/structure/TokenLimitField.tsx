import { useId } from 'react';
import type { AgentAdvanced } from '../generated/AgentAdvanced';
import type { SoftHard } from '../generated/SoftHard';
import type { TokenCount } from '../generated/TokenCount';
import type { TokenLimit } from '../generated/TokenLimit';
import { softHard, softOf } from './budgetDraft';

const COUNT_WORDS: Record<TokenCount, string> = {
  all: 'all tokens',
  new: 'all except cache reads',
  output: 'output only',
};

const whole = (text: string) => (text.trim() === '' ? null : Math.max(0, Math.floor(Number(text) || 0)));

/** Soft and hard boxes for one limit; the soft box shows the 85% default until one is typed. */
function SoftHardBoxes({ label, unit, value, disabled, onChange }: {
  label: string; unit: string; value: SoftHard<number> | undefined; disabled: boolean; onChange: (v: SoftHard<number> | undefined) => void;
}) {
  return (
    <span className="fld-pair">
      <input aria-label={`${label}: soft (${unit})`} className="fld-input" type="number" min={0} disabled={disabled || !value}
        placeholder={value ? `${softOf(value, true)} (85%)` : 'soft'} value={value?.soft ?? ''}
        onChange={(e) => onChange(softHard(whole(e.target.value), value?.hard ?? null))} />
      <input aria-label={`${label}: hard (${unit})`} className="fld-input" type="number" min={0} disabled={disabled}
        placeholder="no limit" value={value?.hard ?? ''}
        onChange={(e) => onChange(softHard(value?.soft ?? null, whole(e.target.value)))} />
    </span>
  );
}

/** Which tokens count toward the limit, and whether the agents it spawns count too. */
function TokenCounting({ limit, disabled, set }: { limit: TokenLimit; disabled: boolean; set: (p: Partial<TokenLimit>) => void }) {
  return (
    <>
      <select aria-label="Which tokens count" className="fld-input" value={limit.counts} disabled={disabled}
        onChange={(e) => set({ counts: e.target.value as TokenCount })}>
        {(Object.keys(COUNT_WORDS) as TokenCount[]).map((c) => <option key={c} value={c}>{COUNT_WORDS[c]}</option>)}
      </select>
      <label>
        <input type="checkbox" checked={limit.include_subagents} disabled={disabled}
          onChange={(e) => set({ include_subagents: e.target.checked })} /> include agents it spawns
      </label>
    </>
  );
}

const NOTE = 'Each box pair is soft, then hard. At the soft value the agent is asked to wrap up with a summary; at the hard value it and the agents it started are stopped at once, like Ctrl+C. '
  + 'Empty soft = 85% of hard. Usage is counted as each model call reports it.';

/** An agent's token, turn and time limits for one run: soft asks it to wrap up, hard stops it at once. */
export function TokenLimitField({ value, turns, minutes, disabled, reason, onChange }: {
  value: AgentAdvanced['token_limit'];
  turns?: AgentAdvanced['turn_limit'];
  minutes?: AgentAdvanced['minute_limit'];
  disabled: boolean;
  reason: string | null;
  onChange: (patch: Partial<AgentAdvanced>) => void;
}) {
  const id = useId();
  const limit: TokenLimit = value ?? { tokens: 0, counts: 'all', include_subagents: true };
  const setTokens = (v: SoftHard<number> | undefined) =>
    onChange({ token_limit: v ? { ...limit, tokens: v.hard, soft: v.soft } : undefined });
  const set = (patch: Partial<TokenLimit>) => onChange({ token_limit: { ...limit, ...patch } });
  return (
    <div className="fld" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="fld-label">Limits for one run</span>
      <span className="fld-row"><span>Tokens</span>
        <SoftHardBoxes label="Tokens" unit="tokens" value={value ? { soft: value.soft, hard: value.tokens } : undefined} disabled={disabled} onChange={setTokens} />
      </span>
      <TokenCounting limit={limit} disabled={disabled || !value} set={set} />
      <span className="fld-row"><span>Turns</span>
        <SoftHardBoxes label="Turns" unit="turns" value={turns} disabled={disabled} onChange={(v) => onChange({ turn_limit: v })} />
      </span>
      <span className="fld-row"><span>Minutes working</span>
        <SoftHardBoxes label="Minutes working" unit="minutes" value={minutes} disabled={disabled} onChange={(v) => onChange({ minute_limit: v })} />
      </span>
      {reason ? <p className="reason fld-reason">{reason}</p> : <p className="fld-meta">{NOTE}</p>}
    </div>
  );
}

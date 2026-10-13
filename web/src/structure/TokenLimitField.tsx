import { useId } from 'react';
import type { AgentAdvanced } from '../generated/AgentAdvanced';
import type { TokenCount } from '../generated/TokenCount';
import type { TokenLimit } from '../generated/TokenLimit';

const COUNT_WORDS: Record<TokenCount, string> = {
  all: 'all tokens',
  new: 'all except cache reads',
  output: 'output only',
};

/** An agent's token limit for one run. Reaching it soft-stops the agent (wrap-up summary, then stop). */
export function TokenLimitField({ value, disabled, reason, onChange }: {
  value: AgentAdvanced['token_limit'];
  disabled: boolean;
  reason: string | null;
  onChange: (next: TokenLimit | undefined) => void;
}) {
  const id = useId();
  const limit: TokenLimit = value ?? { tokens: 0, counts: 'all', include_subagents: true };
  const set = (patch: Partial<TokenLimit>) => {
    const next = { ...limit, ...patch };
    onChange(next.tokens > 0 ? next : undefined);
  };
  return (
    <div className="fld" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="fld-label">Token limit</span>
      <input
        aria-label="Tokens per run (empty = no limit)"
        className="fld-input"
        type="number"
        min={0}
        step={10000}
        placeholder="no limit"
        value={limit.tokens || ''}
        disabled={disabled}
        onChange={(e) => set({ tokens: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
      />
      <select aria-label="Which tokens count" className="fld-input" value={limit.counts} disabled={disabled || !value}
        onChange={(e) => set({ counts: e.target.value as TokenCount })}>
        {(Object.keys(COUNT_WORDS) as TokenCount[]).map((c) => <option key={c} value={c}>{COUNT_WORDS[c]}</option>)}
      </select>
      <label>
        <input type="checkbox" checked={limit.include_subagents} disabled={disabled || !value}
          onChange={(e) => set({ include_subagents: e.target.checked })} /> include agents it spawns
      </label>
      {reason ? <p className="reason fld-reason">{reason}</p> : <p className="fld-meta">Reported usage arrives after each turn, so an agent can go over by up to one turn. Reaching the limit asks it to wrap up with a summary, then stops it.</p>}
    </div>
  );
}

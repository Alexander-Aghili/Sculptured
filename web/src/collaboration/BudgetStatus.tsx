import { usePolled } from '../usePolling';
import { api } from '../api';
import type { TeamBudget } from '../generated/TeamBudget';
import { nameForId, type NameMap } from '../vocab';
import { RunMeters } from './RunMeters';
export function BudgetStatus({rig, names}: {rig:string; names:NameMap}) {
  const { data: budget, error } = usePolled<TeamBudget>(() => api.teamBudget(rig), 2000, [rig]);
  const failed = error !== '';
  const limited = budget?.agents.filter(a => a.token_limit) ?? [];
  // Quiet until a limit is reached: each agent's tokens show on its row.
  const perAgent = limited.some(a => a.exhausted) && <details className="agent-budget">
    <summary>Token limits · {limited.filter(a => a.exhausted).length} reached</summary>
    <ul>{limited.map(a => <li key={a.seat}>{nameForId(a.seat,names)}: {a.token_used === null ? 'usage unknown' : a.token_used.toLocaleString()} / {a.token_limit!.tokens.toLocaleString()} {a.token_limit!.counts === 'all' ? 'tokens' : a.token_limit!.counts === 'new' ? 'tokens excluding cache reads' : 'output tokens'}{a.token_limit!.include_subagents ? ', with agents it spawned' : ''}{a.exhausted ? ' · limit reached' : ''}</li>)}</ul>
  </details>;
  const run = budget?.run ? <RunMeters run={budget.run} waiting={budget.waiting ?? []} names={names} /> : null;
  if (!budget?.output_limit) return failed ? <span className="muted">Budget status unavailable</span> : (run || perAgent) ? <>{run}{perAgent}</> : null;
  return <>{run}{perAgent}<details className="agent-budget">
    <summary>{budget.output_limit.toLocaleString()} output tokens per agent · descendants included{failed ? ' · status unavailable' : ''}</summary>
    <p>Stops an agent and its descendants when reported output reaches the limit. CLI usage reports may be delayed and overshoot. Input tokens are excluded. Usage resets on a new project run.</p>
    <ul>{budget.agents.map(a=><li key={a.seat}>{nameForId(a.seat,names)}: {a.output_used === null ? 'usage unknown' : `${a.output_used.toLocaleString()} / ${budget.output_limit!.toLocaleString()}`} {a.exhausted ? '· budget reached' : ''}</li>)}</ul>
  </details></>;
}

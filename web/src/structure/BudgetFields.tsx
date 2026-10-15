import type { SoftHard } from '../generated/SoftHard';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Edit } from './Panels';
import { budgetProblems, PLAN_ROWS, planOf, softHard, softOf, withBudget, withPlan } from './budgetDraft';

const num = (text: string) => (text.trim() === '' ? null : Math.max(0, Number(text) || 0));

type PairProps = {
  label: string;
  unit: string;
  value: SoftHard<number> | undefined;
  locked: boolean;
  whole?: boolean;
  onChange: (v: SoftHard<number> | undefined) => void;
};

/** One limit's soft and hard values; the soft box shows the 85% default until one is typed. */
function Pair({ label, unit, value, locked, whole, onChange }: PairProps) {
  const set = (soft: number | null, hard: number | null) => onChange(softHard(soft, hard));
  const fallback = value ? `${+softOf(value, whole).toFixed(1)}` : '–';
  return (
    <div className="ta-budget-row" role="group" aria-label={label}>
      <span className="ta-budget-label">{label}{unit === '% of plan' ? ' (%)' : unit === 'minutes' ? ' (minutes)' : ''}</span>
      <input className="fld-input" type="number" min={0} step="any" aria-label={`${label}: soft (${unit})`} placeholder={fallback} disabled={locked || !value}
          value={value?.soft ?? ''} onChange={(e) => set(num(e.target.value), value?.hard ?? null)} />
      <input className="fld-input" type="number" min={0} step="any" aria-label={`${label}: hard (${unit})`} placeholder="–" disabled={locked}
          value={value?.hard ?? ''} onChange={(e) => set(value?.soft ?? null, num(e.target.value))} />
    </div>
  );
}

function MaxWorking({ draft, edit, locked }: { draft: TeamDraft; edit: Edit; locked: boolean }) {
  const set = (text: string) => {
    const n = num(text);
    edit((d) => withBudget(d, (x) => ({ ...x, max_working: n === null ? undefined : Math.floor(n) })), 'budget:max_working');
  };
  return (
    <label className="ta-limit">
      <span>Most agents working at once</span>
      <input className="fld-input" type="number" min={1} placeholder="no limit" aria-label="Most agents working at once" disabled={locked}
        value={draft.budget?.max_working ?? ''} onChange={(e) => set(e.target.value)} />
    </label>
  );
}

const NOTE = 'Soft: no new work starts and every agent wraps up with a summary. Hard: every agent is stopped at once, like Ctrl+C. '
  + 'Empty soft = 85% of hard. Plan percentages count all your use of that plan, including outside Sculptured. The Run board shows each budget as the run goes.';


/** What one run of the team may use. Blank = no budget; Sculptured sets none of its own. */
export function BudgetFields({ draft, edit, locked }: { draft: TeamDraft; edit: Edit; locked: boolean }) {
  const b = draft.budget;
  const problems = budgetProblems(b);
  return (
    <fieldset className="ta-budget">
      <legend className="fld-label">Run budget</legend>
      <div className="ta-budget-head" aria-hidden="true"><span>Soft: wrap up</span><span>Hard: stop</span></div>
      <div className="ta-budget-rows">
          {PLAN_ROWS.map((r) => (
            <Pair key={`${r.provider}-${r.window}`} label={r.label} unit="% of plan" value={planOf(b, r.provider, r.window)} locked={locked}
              onChange={(v) => edit((d) => withBudget(d, (x) => withPlan(x, r.provider, r.window, v)), `budget:${r.provider}:${r.window}`)} />
          ))}
          <Pair label="Tokens" unit="tokens" whole value={b?.tokens} locked={locked}
            onChange={(v) => edit((d) => withBudget(d, (x) => ({ ...x, tokens: v })), 'budget:tokens')} />
          <Pair label="Time" unit="minutes" whole value={b?.minutes} locked={locked}
            onChange={(v) => edit((d) => withBudget(d, (x) => ({ ...x, minutes: v })), 'budget:minutes')} />
      </div>
      <MaxWorking draft={draft} edit={edit} locked={locked} />
      {problems.map((p) => <p key={p} className="reason fld-reason" role="alert">{p}</p>)}
      <p className="fld-meta">{NOTE}</p>
    </fieldset>
  );
}

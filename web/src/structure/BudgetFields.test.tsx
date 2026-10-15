import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { EditResult } from '../useTeamDraft';
import { teamDraft } from '../test-fixtures';
import { BudgetFields } from './BudgetFields';
import { budgetProblems, withBudget, withPlan } from './budgetDraft';

function Harness({ start }: { start: TeamDraft }) {
  const [d, setD] = useState(start);
  const edit = (f: (d: TeamDraft) => EditResult) => {
    const r = f(d);
    setD('draft' in r ? r.draft : r);
    return null;
  };
  return <><BudgetFields draft={d} edit={edit} locked={false} /><pre data-testid="budget">{JSON.stringify(d.budget ?? null)}</pre></>;
}

const budget = () => JSON.parse(screen.getByTestId('budget').textContent!);

describe('BudgetFields', () => {
  it('sets a hard plan share, shows the 85% soft value, then takes a typed soft value', () => {
    render(<Harness start={teamDraft({ id: 't', name: 'T' })} />);
    fireEvent.change(screen.getByLabelText('Claude, 5-hour window: hard (% of plan)'), { target: { value: '30' } });
    expect(budget()).toEqual({ plan: [{ provider: 'claude', window: 'five_hour', hard: 30 }] });
    expect(screen.getByLabelText('Claude, 5-hour window: soft (% of plan)')).toHaveAttribute('placeholder', '25.5');
    fireEvent.change(screen.getByLabelText('Claude, 5-hour window: soft (% of plan)'), { target: { value: '20' } });
    expect(budget().plan[0]).toEqual({ provider: 'claude', window: 'five_hour', soft: 20, hard: 30 });
    fireEvent.change(screen.getByLabelText('Claude, 5-hour window: hard (% of plan)'), { target: { value: '' } });
    expect(budget()).toBeNull();
  });

  it('says when a soft value is above its hard value, as the server would', () => {
    render(<Harness start={{ ...teamDraft({ id: 't', name: 'T' }), budget: { minutes: { soft: 90, hard: 60 } } }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Time budget: the soft value is above the hard value');
  });

  it('keeps the most agents working at once and drops an emptied budget', () => {
    render(<Harness start={teamDraft({ id: 't', name: 'T' })} />);
    fireEvent.change(screen.getByLabelText('Most agents working at once'), { target: { value: '4' } });
    expect(budget()).toEqual({ max_working: 4 });
    fireEvent.change(screen.getByLabelText('Most agents working at once'), { target: { value: '' } });
    expect(budget()).toBeNull();
  });

  it('replaces one window without touching the others', () => {
    const d = withBudget(teamDraft({ id: 't', name: 'T' }), (b) => withPlan(withPlan(b, 'claude', 'five_hour', { hard: 30 }), 'codex', 'five_hour', { hard: 10 }));
    const e = withBudget(d, (b) => withPlan(b, 'claude', 'five_hour', { hard: 25 }));
    expect(e.budget?.plan).toEqual([{ provider: 'codex', window: 'five_hour', hard: 10 }, { provider: 'claude', window: 'five_hour', hard: 25 }]);
    expect(budgetProblems({ plan: [{ provider: 'claude', window: 'five_hour', hard: 130 }] })).toEqual(['Plan budget: 130 is not a percent between 0 and 100']);
  });
});

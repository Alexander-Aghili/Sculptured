import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,expect,it,vi } from 'vitest';
import { api } from '../api';
import { BudgetStatus } from './BudgetStatus';
afterEach(()=>vi.restoreAllMocks());
it('shows delayed output budget evidence for nested agents, keeping unknown usage unknown',async()=>{
  vi.spyOn(api,'teamBudget').mockResolvedValue({output_limit:5000,agents:[{seat:'root',output_used:240,exhausted:false,token_limit:null,token_used:null},{seat:'leaf',output_used:null,exhausted:false,token_limit:null,token_used:null},{seat:'ended',output_used:5010,exhausted:true,token_limit:null,token_used:null}],waiting:[]});
  render(<BudgetStatus rig="test" names={{root:'Coordinator',leaf:'Grandchild',ended:'Stopped child'}}/>);
  await userEvent.click(await screen.findByText('5,000 output tokens per agent · descendants included'));
  expect(screen.getByText(/Grandchild: usage unknown/)).toBeVisible();
  expect(screen.getByText(/Stopped child: 5,010 \/ 5,000/)).toHaveTextContent('budget reached');
  expect(screen.getByText(/CLI usage reports may be delayed and overshoot/)).toBeVisible();
});

it('shows each run budget in words and as a bar, the wrap-up reason, and who waits for a slot', async () => {
  vi.spyOn(api, 'teamBudget').mockResolvedValue({ output_limit: null, agents: [], waiting: ['b'],
    run: { state: { state: 'wrap-up', reason: 'Claude 5-hour: 26.0% used, past the run’s soft limit of 25.5%', at_ms: 1 }, wrap_up_ms: 1, continue_with: null,
      meters: [
        { what: 'Claude 5-hour', unit: 'percent', used: 26, soft: 25.5, hard: 30, reserve: 0.4, estimated: true, observed_ms: null, pause: null },
        { what: 'Tokens', unit: 'tokens', used: 1_200_000, soft: 1_700_000, hard: 2_000_000, reserve: 0, estimated: false, observed_ms: null, pause: null },
        { what: 'Codex 5-hour', unit: 'percent', used: null, soft: 8.5, hard: 10, reserve: 0, estimated: false, observed_ms: null, pause: null },
      ] } });
  render(<BudgetStatus rig="test" names={{ b: 'Builder' }} />);
  expect(await screen.findByRole('status')).toHaveTextContent('Wrapping up: Claude 5-hour: 26.0% used');
  expect(screen.getByText('Claude 5-hour: 26% of 30% · wrap-up at 25.5%')).toBeVisible();
  expect(screen.getByText('includes an estimate')).toBeVisible();
  expect(screen.getByRole('meter', { name: 'Tokens: 1.2M of 2.0M · wrap-up at 1.7M' })).toHaveAttribute('value', '1200000');
  expect(screen.getByText('waiting for the first plan reading')).toBeVisible();
  expect(screen.getByText('Waiting for a slot: Builder')).toBeVisible();
});

it('says until when a paused run waits, and lets the person continue now, switch how it continues, or stop', async () => {
  const until = new Date(2026, 9, 15, 17, 40).getTime();
  vi.spyOn(api, 'teamBudget').mockResolvedValue({ output_limit: null, agents: [], waiting: [],
    run: { state: { state: 'paused', reason: 'Claude 5-hour: 30.2% used of the run’s hard limit of 30.0%; every agent was stopped and the run is paused until the window resets (window 1 of 3)', at_ms: 1, until_ms: until, window: 1, max_windows: 3 },
      wrap_up_ms: 1, meters: [], continue_with: 'notes' } });
  const act = vi.spyOn(api, 'budgetPaused').mockResolvedValue({});
  render(<BudgetStatus rig="test" names={{}} />);
  expect(await screen.findByRole('status')).toHaveTextContent(`Paused until ${new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  expect(screen.getByRole('status')).toHaveTextContent('window 1 of 3');
  await userEvent.selectOptions(screen.getByLabelText('Continue'), 'resume');
  expect(act).toHaveBeenCalledWith('test', 'mode', 'resume');
  await userEvent.click(screen.getByRole('button', { name: 'Continue now' }));
  expect(act).toHaveBeenCalledWith('test', 'continue');
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(act).toHaveBeenCalledWith('test', 'stop');
});

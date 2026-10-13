import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,expect,it,vi } from 'vitest';
import { api } from '../api';
import { BudgetStatus } from './BudgetStatus';
afterEach(()=>vi.restoreAllMocks());
it('shows delayed output budget evidence for nested agents, keeping unknown usage unknown',async()=>{
  vi.spyOn(api,'teamBudget').mockResolvedValue({output_limit:5000,agents:[{seat:'root',output_used:240,exhausted:false,token_limit:null,token_used:null},{seat:'leaf',output_used:null,exhausted:false,token_limit:null,token_used:null},{seat:'ended',output_used:5010,exhausted:true,token_limit:null,token_used:null}]});
  render(<BudgetStatus rig="test" names={{root:'Coordinator',leaf:'Grandchild',ended:'Stopped child'}}/>);
  await userEvent.click(await screen.findByText('5,000 output tokens per agent · descendants included'));
  expect(screen.getByText(/Grandchild: usage unknown/)).toBeVisible();
  expect(screen.getByText(/Stopped child: 5,010 \/ 5,000/)).toHaveTextContent('budget reached');
  expect(screen.getByText(/CLI usage reports may be delayed and overshoot/)).toBeVisible();
});

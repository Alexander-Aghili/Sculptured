import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi, beforeEach } from 'vitest';
import { api } from '../api';
import { teamDraft } from '../test-fixtures';
import { TextbookSetup } from './TextbookSetup';
vi.mock('../api',async orig=>{const m=await orig<typeof import('../api')>();return {...m,api:{...m.api,getTeam:vi.fn(),prepareTextbook:vi.fn()}};});
beforeEach(()=>vi.clearAllMocks());
it('prepares the saved folder without starting a run or choosing a source',async()=>{
  const d=teamDraft({folder:'/home/test/book'}),user=userEvent.setup();
  vi.mocked(api.getTeam).mockResolvedValue({draft:{...d,revision:9},live:false,started_revision:null,issues:[]});
  vi.mocked(api.prepareTextbook).mockResolvedValue({folder:d.folder!,files:20,commands:['npm ci','npm run dev']});
  render(<TextbookSetup draft={d} locked={false}/>);await user.click(screen.getByText('Live textbook starter'));await user.click(screen.getByRole('button',{name:'Prepare textbook folder'}));
  expect(api.prepareTextbook).toHaveBeenCalledWith(d.id,9);expect(await screen.findByRole('status')).toHaveTextContent('No source is preselected');expect(screen.getByRole('button',{name:'Starter prepared'})).toBeDisabled();
});
it('prevents preparation while running',async()=>{
  const user=userEvent.setup();render(<TextbookSetup draft={teamDraft({folder:'/home/test/book'})} locked/>);await user.click(screen.getByText('Live textbook starter'));
  expect(screen.getByRole('button',{name:'Prepare textbook folder'})).toBeDisabled();expect(screen.getByText('Stop the team before preparing a folder.')).toBeInTheDocument();
});

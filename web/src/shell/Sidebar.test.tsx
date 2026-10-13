import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi,beforeEach} from 'vitest';
import {api} from '../api';
vi.mock('../api',async(orig)=>{const m=await orig<typeof import('../api')>();return {...m,api:{...m.api,projectVisibility:vi.fn(),setProjectVisibility:vi.fn()}};});
beforeEach(()=>{vi.mocked(api.projectVisibility).mockResolvedValue([]);vi.mocked(api.setProjectVisibility).mockImplementation(async(id,status)=>({id,status}));});
import {Sidebar} from './Sidebar';
import type {TeamRow} from './model';
it('opens and closes projects independently without navigating and remembers explicit choices',async()=>{
  localStorage.removeItem('sculptured.sidebar.expanded');
  const team=(rig:string)=>({rig,title:rig,href:`/rig/${rig}`,loaded:true,connected:true,draftOnly:true,agents:[],counts:{}} as unknown as TeamRow);
  const props={teams:[team('One'),team('Two')],project:'One',now:0};
  const {unmount}=render(<MemoryRouter><Sidebar {...props}/></MemoryRouter>);const user=userEvent.setup();
  await user.click(screen.getByRole('button',{name:'Open Two in sidebar'}));expect(screen.getByRole('button',{name:'Close One in sidebar'})).toHaveAttribute('aria-expanded','true');
  expect(within(screen.getByRole('region',{name:'team Two'})).getByText('No agents.')).toBeVisible();
  await user.click(screen.getByRole('button',{name:'Close One in sidebar'}));expect(screen.getByRole('button',{name:'Open One in sidebar'})).toHaveAttribute('aria-expanded','false');
  unmount();render(<MemoryRouter><Sidebar {...props}/></MemoryRouter>);expect(screen.getByRole('button',{name:'Open One in sidebar'})).toBeVisible();expect(screen.getByRole('button',{name:'Close Two in sidebar'})).toBeVisible();localStorage.removeItem('sculptured.sidebar.expanded');
});

it('hides, trashes and restores projects through persisted visibility controls',async()=>{
 const team={rig:'sample',title:'Sample',href:'/team/sample/structure',loaded:true,connected:true,draftOnly:true,agents:[],counts:{}} as unknown as TeamRow;
 const user=userEvent.setup();render(<MemoryRouter><Sidebar teams={[team]} now={0}/></MemoryRouter>);
 await user.click(screen.getByLabelText('Manage Sample'));await user.click(screen.getByRole('button',{name:'Hide from sidebar'}));
 await screen.findByText('Hidden projects (1)');expect(screen.queryByRole('region',{name:'team Sample'})).toBeNull();await user.click(screen.getByText('Hidden projects (1)'));await user.click(screen.getByRole('button',{name:'Show'}));
 await screen.findByRole('region',{name:'team Sample'});await user.click(screen.getByLabelText('Manage Sample'));await user.click(screen.getByRole('button',{name:'Move to Trash'}));await screen.findByText('Trash (1)');await user.click(screen.getByText('Trash (1)'));await user.click(screen.getByRole('button',{name:'Restore'}));
 await screen.findByRole('region',{name:'team Sample'});expect(api.setProjectVisibility).toHaveBeenCalledWith('sample','trashed');expect(api.setProjectVisibility).toHaveBeenLastCalledWith('sample','visible');
});

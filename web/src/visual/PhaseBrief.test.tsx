import {render,screen,fireEvent,within} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {deriveProcess} from './process';
import {phaseBrief,PhaseBrief} from './PhaseBrief';
import {ev} from '../test-fixtures';
it('summarizes explicit reports, preserves failure evidence, and links tools and rationale to their sources',()=>{
 const p=deriveProcess([
 ev(1,{type:'message-queued',message_id:'m',intent:'inform',text:'Build the graph'}),ev(2,{type:'turn-started',turn_id:'t'}),ev(3,{type:'message-consumed',message_id:'m',turn_id:'t'}),
 ev(4,{type:'agent-text',turn_id:'t',text:'Use curved arrows because reciprocal messages overlap.'}),
 ev(5,{type:'tool-called',turn_id:'t',call_id:'c',name:'Bash',input:{command:'npm test'},parent_call_id:null}),ev(6,{type:'tool-resulted',turn_id:'t',call_id:'c',output:'1 failed',is_error:true}),
 ev(7,{type:'agent-text',turn_id:'t',text:'Implemented the graph.\nNext steps: fix the failing test.'})]).phases[0];
 const brief=phaseBrief(p);expect(brief.find(x=>x.id==='challenges')?.tier).toBe('Captured tool results');expect(brief.find(x=>x.id==='why')?.text).toContain('because');expect(brief.find(x=>x.id==='accomplished')?.tier).toBe('Agent-reported excerpt');
 const jump=vi.fn();render(<PhaseBrief phase={p} onJump={jump}/>);fireEvent.click(screen.getByRole('button',{name:'Inspect challenges for turn 1'}));
 const detail=screen.getByRole('region',{name:'Challenges evidence for turn 1'});expect(within(detail).getByText('1 failed')).toBeInTheDocument();fireEvent.click(within(detail).getByRole('button',{name:'Open tool in transcript'}));expect(jump).toHaveBeenCalledWith('t-c-5');
 fireEvent.click(screen.getByRole('button',{name:'Inspect why for turn 1'}));expect(screen.getByRole('region',{name:'Why evidence for turn 1'})).toHaveTextContent('Use curved arrows because');
});
it('does not fabricate goals, next steps or rationale from tool success',()=>{
 const p=deriveProcess([ev(1,{type:'turn-started',turn_id:'t'})]).phases[0];expect(phaseBrief(p).every(x=>x.tier==='Unknown')).toBe(true);
});
it('keeps a no-blockers report out of attention items without hiding actual failures',()=>{
 const p=deriveProcess([ev(1,{type:'turn-started',turn_id:'t'}),ev(2,{type:'agent-text',turn_id:'t',text:'No blockers.'})]).phases[0];
 expect(phaseBrief(p).find(x=>x.id==='challenges')?.tier).toBe('Unknown');
 p.steps.push({key:'failed',name:'Check',summary:'failed check',status:'error'} as typeof p.steps[number]);
 expect(phaseBrief(p).find(x=>x.id==='challenges')?.tier).toBe('Captured tool results');
});

it('shows a compact activity list without empty categories or invented accomplishments',()=>{
 const p=deriveProcess([ev(1,{type:'turn-started',turn_id:'t'}),ev(2,{type:'agent-text',turn_id:'t',text:'Next steps: wait for the reviewer.'})]).phases[0];render(<PhaseBrief phase={p} onJump={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Inspect accomplished for turn 1'})).toBeNull();expect(screen.queryByRole('button',{name:'Inspect why for turn 1'})).toBeNull();expect(screen.getByRole('button',{name:'Inspect next steps for turn 1'})).toHaveTextContent('Next action');
});

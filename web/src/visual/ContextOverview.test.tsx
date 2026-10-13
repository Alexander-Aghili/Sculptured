import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { ContextOverview } from './ContextOverview';
import { contextEvents, deriveContext } from './context';
import { ev } from '../test-fixtures';
import { TEAM_START_ACTOR } from '../conversation';
const fixture = () => [
  ev(1,{type:'tenure-started',tenure:1,cause:'fresh',driver:'codex',native_session_id:null,caps:{} as never}),
  {...ev(2,{type:'message-queued',message_id:'job',intent:'inform',text:'Team architecture (operator configuration): Test\nRole: builder\n\n--- Current message ---\nRead the source https://example.test/notes'}),actor:{kind:'system' as const,id:TEAM_START_ACTOR}},
  ev(3,{type:'message-consumed',message_id:'job',turn_id:'t1'}),
  ev(4,{type:'tool-called',turn_id:'t1',call_id:'read',name:'Read',input:{file_path:'/project/notes.md'},parent_call_id:null}),
  ev(5,{type:'tool-resulted',turn_id:'t1',call_id:'read',output:'Definitions and a theorem.',is_error:false}),
  ev(6,{type:'agent-text',turn_id:'t1',text:'I found the definition.'}),
  ev(7,{type:'context-reported',turn_id:'t1',used_tokens:12000,window_tokens:100000,basis:'reported'}),
  ev(8,{type:'message-queued',message_id:'pending',intent:'inform',text:'Not consumed'}),
];
it('counts consumed content once and keeps reported usage separate',()=>{
  const c=deriveContext(contextEvents([...fixture(),fixture()[4]]).events);
  expect(c.pending).toBe(1); expect(c.entries.some(e=>e.text==='Not consumed')).toBe(false);
  expect(c.categories.find(x=>x.kind==='instructions')?.count).toBe(2);
  expect(c.categories.find(x=>x.kind==='tool-results')?.count).toBe(1);
  expect(c.paths).toEqual(['/project/notes.md']);expect(c.urls).toEqual(['https://example.test/notes']);
  expect(c.report?.body.used_tokens).toBe(12000);expect(c.chars).toBeLessThan(12000);
  expect(c.entries.find(e=>e.kind==='tool-results')?.key).toBe('t-read-4');
});
it('resets at a session boundary and preserves unknown capacity',()=>{
  const scope=contextEvents([...fixture(),ev(9,{type:'tenure-started',tenure:2,cause:'resume',driver:'codex',native_session_id:'resumed',caps:{} as never}),ev(10,{type:'context-reported',turn_id:null,used_tokens:600,window_tokens:null,basis:'estimated'})]);
  const c=deriveContext(scope.events);expect(c.entries).toEqual([]);expect(c.report?.body.window_tokens).toBeNull();expect(scope.boundaryKnown).toBe(true);
  expect(contextEvents(fixture().slice(1)).boundaryKnown).toBe(false);
});
it('excludes nested helper internals and reasoning from content estimates',()=>{
  const c=deriveContext([ev(1,{type:'tool-called',turn_id:'t',call_id:'child',name:'Read',input:{file_path:'/private/helper'},parent_call_id:'parent'}),ev(2,{type:'tool-resulted',turn_id:'t',call_id:'child',output:'child content',is_error:false}),ev(3,{type:'thinking-recorded',turn_id:'t',item_id:null,parent_call_id:null,form:'hidden',text:'',estimated_tokens:400})]);
  expect(c.chars).toBe(0);expect(c.paths).toEqual([]);expect(c.hiddenThinking).toBe(1);
});
it('supports keyboard category drill-down and transcript navigation',async()=>{
  const user=userEvent.setup(),jump=vi.fn();render(<ContextOverview seatId="context-ui" events={fixture()} partial={false} loading={false} onJump={jump}/>);
  expect(screen.getByText('12,000 / 100,000 tokens · 12%')).toBeInTheDocument();expect(screen.getByRole('meter')).toHaveAttribute('value','12000');
  expect(screen.getByText(/not an exact map/)).toBeInTheDocument();
  const category=screen.getByRole('button',{name:/Tool results/}); category.focus();await user.keyboard('{Enter}');expect(category).toHaveAttribute('aria-pressed','true');
  await user.click(screen.getByText(/Read result ·/));expect(screen.getByText('Definitions and a theorem.')).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Open transcript record'}));expect(jump).toHaveBeenCalledWith('t-read-4');
});
it('keeps historical selection across updates and discloses partial evidence',async()=>{
  const user=userEvent.setup(),base=fixture(),props={seatId:'history-ui',partial:true,loading:false,onJump:vi.fn()};
  const r=render(<ContextOverview {...props} events={base}/>);await user.selectOptions(screen.getByLabelText('Context snapshot'),'7');
  r.rerender(<ContextOverview {...props} events={[...base,ev(9,{type:'agent-text',turn_id:'t1',text:'A later result'}),ev(10,{type:'context-reported',turn_id:'t1',used_tokens:24000,window_tokens:100000,basis:'reported'})]}/>);
  expect(screen.getByLabelText('Context snapshot')).toHaveValue('7');expect(screen.getByText('12,000 / 100,000 tokens · 12%')).toBeInTheDocument();expect(screen.getByText(/Partial history/)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Context snapshot'),'latest');expect(screen.getByText('24,000 / 100,000 tokens · 24%')).toBeInTheDocument();
});
it('never invents capacity when the CLI did not report it',()=>{
  render(<ContextOverview seatId="unknown-ui" events={[]} partial={false} loading={false} onJump={vi.fn()}/>);
  expect(screen.getByText('Context usage unknown')).toBeInTheDocument();expect(screen.queryByRole('meter')).not.toBeInTheDocument();
});
it('counts explicit nested file-change paths without interpreting shell commands',()=>{
  const d=deriveContext([ev(1,{type:'tool-called',turn_id:'t',call_id:'files',name:'fileChange',input:{changes:[{path:'/project/a.ts'},{path:'/project/a.ts'},{path:'/project/b.ts'}]},parent_call_id:null}),ev(2,{type:'tool-called',turn_id:'t',call_id:'shell',name:'commandExecution',input:{command:'cat /project/unknown.ts'},parent_call_id:null})]);
  expect(d.paths.sort()).toEqual(['/project/a.ts','/project/b.ts']);
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { closedGroupBox, groupVisibilityKey, projectGroups, routeGroupEdges } from './groupVisibility';
import { WorkflowGraph } from '../workflow/WorkflowGraph';
import { draftAgent, teamDraft } from '../test-fixtures';

beforeEach(() => localStorage.clear());
const group = { id:'visual', label:'Visualization', x:300,y:0,w:600,h:500 };
const agents = [draftAgent('dispatch',{x:0}), draftAgent('research',{x:340,group_id:'visual'}), draftAgent('build',{x:620,group_id:'visual'}), draftAgent('front',{x:1100})];
const draft = teamDraft({ groups:[group], agents, connections:[], workflow:{ input:'General notes', dispatcher:'dispatch',collector:'front',entry:'research',max_tasks:24,max_steps:12,
  stages:[{id:'research',name:'Research',agent:'research',routes:{ready:'build'}},{id:'build',name:'Build',agent:'build',routes:{revise:'research',accept:null}}] } });

it('routes both directions across collapsed group boundaries while removing internal edges', () => {
  const boxes = { a:{x:0,y:0,w:100,h:100}, b:{x:340,y:40,w:100,h:100}, c:{x:620,y:40,w:100,h:100}, d:{x:1100,y:40,w:100,h:100} };
  const p = projectGroups(boxes,{b:'visual',c:'visual',d:'other'},{visual:group,other:{x:1050,y:0,w:300,h:300}},new Set(['visual','other','removed']));
  const edge = (from:string,to:string) => ({from,to,kind:'delegates_to' as const,enforced:true});
  const inbound=edge('a','b'), internal=edge('b','c'), outbound=edge('c','d'), reverse=edge('d','a');
  const routes=routeGroupEdges([inbound,internal,outbound,reverse],p);
  expect(routes.has(internal)).toBe(false);
  expect(routes.size).toBe(3);
  expect(p.boxes).not.toHaveProperty('b');
  const b=closedGroupBox(group);
  expect(routes.get(inbound)!.pts[3]).toEqual({x:b.x,y:b.y+b.h/2});
  expect(routes.get(outbound)!.pts[0]).toEqual({x:b.x+b.w,y:b.y+b.h/2});
  expect(boxes.b.x).toBe(340);
});

it('hides workflow loops and labels, retains dispatcher and collector links and restores every route', async () => {
  const onOpen=vi.fn(), onReveal=vi.fn();
  const {rerender,container}=render(<WorkflowGraph draft={draft} collapsed={new Set(['visual'])} onOpen={onOpen} onReveal={onReveal} />);
  expect(screen.queryByRole('button',{name:'Workflow route: ready'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Workflow route: revise'})).toBeNull();
  expect(container.querySelectorAll('path.edge')).toHaveLength(3);
  await userEvent.click(screen.getByRole('button',{name:'Workflow route: accept · all N accepted'}));
  expect(onOpen).toHaveBeenCalledWith({stage:'build'});
  expect(screen.getByRole('button',{name:'Workflow route: Dispatch N · max 24'})).toBeVisible();
  rerender(<WorkflowGraph draft={draft} collapsed={new Set()} onOpen={onOpen} onReveal={onReveal} />);
  expect(screen.getByRole('button',{name:'Workflow route: revise'})).toBeVisible();
  expect(container.querySelectorAll('path.edge')).toHaveLength(5);
});

it('ignores a stale collapsed group id when its group no longer exists', () => {
  localStorage.setItem(groupVisibilityKey('t'),'["removed"]');
  const boxes={a:{x:0,y:0,w:100,h:100}};
  expect(projectGroups(boxes,{a:'removed'},{},new Set(['removed'])).boxes).toEqual(boxes);
});

it('draws one arrow per pair of drawn ends when a group is collapsed, preferring a handoff', () => {
  const boxes = { a:{x:0,y:0,w:100,h:100}, b:{x:340,y:40,w:100,h:100}, c:{x:620,y:40,w:100,h:100}, d:{x:1100,y:40,w:100,h:100} };
  const p = projectGroups(boxes,{b:'visual',c:'visual'},{visual:group},new Set(['visual']));
  const edge = (from:string,to:string,enforced=true) => ({from,to,kind:'delegates_to' as const,enforced});
  const soft=edge('a','c',false), ab=edge('a','b'), ac=edge('a','c'), bd=edge('b','d'), cd=edge('c','d'), da=edge('d','a');
  const routes=routeGroupEdges([soft,ab,ac,bd,cd,da],p);
  expect([...routes.keys()]).toEqual([ab,bd,da]);
  expect(routes.get(ab)!.merged).toEqual([ab,soft,ac]);
  expect(routes.get(bd)!.merged).toHaveLength(2);
  expect(routes.get(da)!.merged).toEqual([da]);
  expect(routeGroupEdges([ab,ac],projectGroups(boxes,{},{},new Set())).size).toBe(2);
});

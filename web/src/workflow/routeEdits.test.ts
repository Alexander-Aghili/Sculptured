import { expect, it } from 'vitest';
import { draftAgent, teamDraft } from '../test-fixtures';
import { reconnect } from '../draft/edits';
import { reconnectWorkflowRoute } from './routeEdits';

it('rejects missing endpoints, self links and duplicates while preserving the existing connection', () => {
  const draft = teamDraft();
  for (const target of ['missing','builder']) {
    const result = reconnect(draft,'c1','to',target);
    expect(result.draft).toBe(draft); expect(result.reason).toBeTruthy();
  }
  const d = {...draft, agents:[...draft.agents,draftAgent('third')],connections:[...draft.connections,{...draft.connections[0],id:'c2',to:'third'}]};
  expect(reconnect(d,'c1','to','third')).toMatchObject({draft:d,reason:expect.any(String)});
});

it('retargets dispatch and review loops, and refuses ambiguous stage destinations', () => {
  const d=teamDraft({agents:['dispatch','builder','reviewer','collector'].map(id=>draftAgent(id)),connections:[],workflow:{input:'',dispatcher:'dispatch',collector:'collector',entry:'build',max_tasks:24,max_steps:12,stages:[{id:'build',name:'Build',agent:'builder',routes:{ready:'review'}},{id:'review',name:'Review',agent:'reviewer',routes:{revise:'build',accept:null}}]}});
  expect(reconnectWorkflowRoute(d,'dispatch','reviewer').draft.workflow?.entry).toBe('review');
  expect(reconnectWorkflowRoute(d,'review:revise','reviewer').draft.workflow?.stages[1].routes.revise).toBe('review');
  expect(reconnectWorkflowRoute(d,'review:revise','collector').draft.workflow?.stages[1].routes.revise).toBeNull();
  expect(reconnectWorkflowRoute(d,'dispatch','collector').reason).toBeTruthy();
  d.workflow!.stages.push({id:'other',name:'Other',agent:'builder',routes:{done:null}});
  expect(reconnectWorkflowRoute(d,'review:revise','builder')).toMatchObject({draft:d,reason:expect.stringContaining('several stages')});
});

it('retargets a route or dispatch onto a stage box', () => {
  const d=teamDraft({agents:['dispatch','builder','collector'].map(id=>draftAgent(id)),connections:[],workflow:{input:'',dispatcher:'dispatch',collector:'collector',entry:'build',max_tasks:24,max_steps:12,stages:[
    {id:'build',name:'Build',agent:'builder',routes:{ready:null}},
    {id:'tests',name:'Tests',agent:'',kind:'check',command:'npm test',routes:{passed:null,failed:'build'}}]}});
  expect(reconnectWorkflowRoute(d,'build:ready','$stage:tests').draft.workflow?.stages[0].routes.ready).toBe('tests');
  expect(reconnectWorkflowRoute(d,'dispatch','$stage:tests').draft.workflow?.entry).toBe('tests');
  expect(reconnectWorkflowRoute(d,'build:ready','$stage:missing').reason).toBeTruthy();
});

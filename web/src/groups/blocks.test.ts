import { expect,it } from 'vitest';
import { teamDraft,draftAgent } from '../test-fixtures';
import { captureGroup,insertBlock } from './blocks';
const source=()=>teamDraft({groups:[{id:'g',label:'Pair',x:0,y:0,w:560,h:300}],agents:[draftAgent('builder',{group_id:'g',x:40,y:40,folder:'/old/project'}),draftAgent('reviewer',{group_id:'g',x:300,y:40}),draftAgent('outside')],connections:[{id:'internal',from:'builder',to:'reviewer',kind:'hands-work-to'},{id:'external',from:'reviewer',to:'outside',kind:'hands-work-to'}]});
it('captures only group contents, preserving internal links and recording boundary connections',()=>{
 const b=captureGroup(source(),'g');expect(b.draft.agents).toHaveLength(2);expect(b.draft.connections.map(c=>c.id)).toEqual(['internal']);expect(b.boundary_notes).toHaveLength(1);expect(b.draft.agents[0].folder).toBeNull();
});
it('inserts independent copies with collision-free IDs, positions and inherited project folder',()=>{
 const b=captureGroup(source(),'g'),target=teamDraft({folder:'/new',agents:[],connections:[]});
 const first=insertBlock(target,b,{x:80,y:120}),second=insertBlock(first.draft,b,{x:800,y:120});
 expect(second.draft.groups).toHaveLength(2);expect(new Set(second.draft.agents.map(a=>a.id)).size).toBe(4);expect(new Set(second.draft.agents.map(a=>a.name)).size).toBe(4);expect(second.draft.groups[1].label).toBe('Pair 2');
 const [a,b2]=second.draft.connections;expect(a.to).not.toBe(b2.to);expect(second.draft.agents.every(a=>a.folder===null)).toBe(true);
 expect(second.draft.agents[0]).toMatchObject({x:120,y:160});expect(b.draft.agents[0].id).toBe('builder');expect(first.draft.agents).toHaveLength(2);
});
it('preserves workflow review loops and worker pools across copies without stale stage IDs',()=>{
 const d=source();d.connections=[];d.workflow={input:'source',dispatcher:'outside',collector:'outside',entry:'build',max_tasks:24,max_steps:12,stages:[{id:'build',name:'Build',agent:'builder',routes:{ready:'review'}},{id:'review',name:'Review',agent:'reviewer',workers:[],routes:{revise:'build',accept:null}}]};
 const block=captureGroup(d,'g'),inserted=insertBlock(d,block).draft;const stages=inserted.workflow!.stages.slice(2);
 expect(stages[0].routes.ready).toBe(stages[1].id);expect(stages[1].routes.revise).toBe(stages[0].id);expect(stages[1].routes.accept).toBeNull();expect(stages[0].agent).not.toBe('builder');
 expect(insertBlock(teamDraft(),block).reason).toContain('workflow project');
});
it('adopts workflow stages into an empty project with new agent and stage IDs',()=>{
 const d=source();d.connections=[];d.workflow={input:'private',dispatcher:'builder',collector:'reviewer',entry:'build',max_tasks:24,max_steps:12,stages:[{id:'build',name:'Build',agent:'builder',routes:{ready:'review'}},{id:'review',name:'Review',agent:'reviewer',routes:{revise:'build',accept:null}}]};
 const block=captureGroup(d,'g');block.draft.workflow!.dispatcher='builder';block.draft.workflow!.collector='reviewer';
 const result=insertBlock(teamDraft({agents:[],connections:[]}),block);
 expect(result.reason).toBeUndefined();const w=result.draft.workflow!;
 expect(w.entry).toBe(w.stages[0].id);expect(w.dispatcher).toBe(result.draft.agents[0].id);expect(w.collector).toBe(result.draft.agents[1].id);expect(w.input).toBe('');expect(w.stages[1].routes.revise).toBe(w.entry);
});

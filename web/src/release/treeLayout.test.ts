import {expect,it} from 'vitest';
import {compiledRig, seatView, ev} from '../test-fixtures';
import {computeLayout, CARD_H, CARD_W} from '../layout';
import {parentForest,treeLayout} from './treeLayout';
import {liveProjection} from './live';
import {routeEdges} from '../shell/edgeGeometry';
function tree() {
  const rig=compiledRig();
  rig.seats=['root','a','b','a1','a2','b1','b2'].map(id=>({...rig.seats[0],id,member:id}));
  rig.edges=[];
  const links=[{parent:'root',child:'a'},{parent:'root',child:'b'},{parent:'a',child:'a1'},{parent:'a',child:'a2'},{parent:'b',child:'b1'},{parent:'b',child:'b2'}];
  return {rig,links};
}
it('lays out seven agents in three centered, nonoverlapping generations',()=>{
  const {rig,links}=tree();const l=treeLayout(computeLayout(rig),rig,links);
  expect(new Set(Object.values(l.seats).map(b=>b.y)).size).toBe(3);
  for(const {parent,child} of links) expect(l.seats[child].y).toBeGreaterThan(l.seats[parent].y+CARD_H);
  expect(l.seats.a.y).toBe(l.seats.b.y);
  expect(l.seats.a1.y).toBe(l.seats.b2.y);
  expect(l.seats.root.x).toBe((l.seats.a.x+l.seats.b.x)/2);
  expect(l.seats.a.x).toBe((l.seats.a1.x+l.seats.a2.x)/2);
  expect(l.seats.b1.x).toBeGreaterThan(l.seats.a2.x+CARD_W);
});
it('keeps hierarchy arrows downward and unlabeled while preserving cross-branch traffic',()=>{
  const {rig,links}=tree();
  const seats=Object.fromEntries(rig.seats.map(s=>[s.id,seatView('a',{id:s.id})]));
  const message=(seq:number,from:string,to:string)=>({...ev(seq,{type:'message-queued' as const,message_id:`m${seq}`,intent:'inform' as const,text:'Result'},to),actor:{kind:'seat' as const,id:from}});
  const events=[message(1,'a1','a'),message(2,'a','b')];
  const view=liveProjection(rig,seats,events,computeLayout(rig),links);
  const hierarchy=view.compiled.edges.filter(e=>e.kind==='spawned_by');
  expect(hierarchy).toHaveLength(6);
  for(const edge of hierarchy){
    expect(links).toContainEqual({parent:edge.from,child:edge.to});
    expect(view.labels[`${edge.from}→${edge.to}`]).toBe('');
    const g=routeEdges([edge],view.layout.seats).get(edge)!;
    expect(g.pts[0].y).toBe(view.layout.seats[edge.from].y+CARD_H);
    expect(g.pts[3].y).toBe(view.layout.seats[edge.to].y);
    expect(g.pts[3].y).toBeGreaterThan(g.pts[0].y);
  }
  expect(view.compiled.edges).toContainEqual({from:'a',to:'b',kind:'collaborates_with',enforced:true});
  expect(events).toHaveLength(2);
});
it('preserves positions when parents stop and leaves appear alone in Live',()=>{
  const {rig,links}=tree();const seats=Object.fromEntries(rig.seats.map(s=>[s.id,seatView('a',{id:s.id})]));
  const before=liveProjection(rig,seats,[],undefined,links);
  seats.a.lifecycle='stopped';
  const after=liveProjection(rig,seats,[],undefined,links);
  expect(after.layout.seats.a).toBeUndefined();
  expect(after.layout.seats.a1).toEqual(before.layout.seats.a1);
  expect(after.compiled.edges.some(e=>e.from==='a'||e.to==='a')).toBe(false);
});
it('ignores invalid parents and cycles without inventing nodes or hanging',()=>{
  const {rig}=tree();
  const links=parentForest(rig,[{parent:'root',child:'a'},{parent:'a',child:'root'},{parent:'missing',child:'b'},{parent:'b',child:'b'}]);
  expect(links).toEqual([{parent:'root',child:'a'}]);
  expect(Object.keys(treeLayout(computeLayout(rig),rig,links).seats)).toHaveLength(7);
});

it('packs uneven branches with ten siblings and four levels, and scopes without unrelated nodes',()=>{
  const {rig,links}=tree();
  for(let i=0;i<8;i++) {const id=`wide-${i}`;rig.seats.push({...rig.seats[0],id,member:id});links.push({parent:'a',child:id});}
  for(const [parent,child] of [['b1','deep'],['deep','deepest']]) {rig.seats.push({...rig.seats[0],id:child,member:child});links.push({parent,child});}
  const seats=Object.fromEntries(rig.seats.map(s=>[s.id,seatView('a',{id:s.id})]));
  const full=liveProjection(rig,seats,[],undefined,links);
  const boxes=Object.values(full.layout.seats);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j];expect(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y).toBe(true);
  }
  expect(full.layout.seats.deepest.y).toBeGreaterThan(full.layout.seats.deep.y);
  const scoped=liveProjection(rig,seats,[],undefined,links,'b');
  expect(scoped.compiled.seats.map(s=>s.id)).toEqual(['b','b1','b2','deep','deepest']);
  expect(scoped.layout.width).toBeLessThan(full.layout.width);
  expect(scoped.compiled.edges.every(e=>e.from!=='root' && e.from!=='a')).toBe(true);
  expect(liveProjection(rig,seats,[],undefined,links,'missing').compiled.seats).toEqual([]);
});

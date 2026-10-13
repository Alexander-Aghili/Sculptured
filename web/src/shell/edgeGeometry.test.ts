import {it,expect} from 'vitest';
import {routeEdges} from './edgeGeometry';
import {bezierPoints} from './labels';
it('uses separate ports for ten children and preserves routes when event order changes',()=>{
 const seats=Object.fromEntries(['root',...Array.from({length:10},(_,i)=>String(i))].map((id,i)=>[id,{x:i===0?1200:(i-1)*280,y:i===0?0:320,w:200,h:200}]));
 const edges=Array.from({length:10},(_,i)=>({from:'root',to:String(i),kind:'spawned_by' as const,enforced:true}));
 const routes=routeEdges(edges,seats);expect(new Set([...routes.values()].map(g=>g.pts[0].x)).size).toBe(10);
 const reversed=routeEdges([...edges].reverse(),seats);for(const e of edges)expect(routes.get(e)).toEqual(reversed.get(e));
});
it('separates reciprocal vertical arrows and routes around intervening cards',()=>{
 const seats={a:{x:0,y:0,w:200,h:200},b:{x:0,y:640,w:200,h:200},c:{x:0,y:320,w:200,h:200}};
 const edges=[{from:'a',to:'b',kind:'delegates_to' as const,enforced:true},{from:'b',to:'a',kind:'delegates_to' as const,enforced:true}];
 const g=routeEdges(edges,seats);expect(g.get(edges[0])?.mid.x).not.toBe(g.get(edges[1])?.mid.x);
 for(const route of g.values())expect(bezierPoints(route.pts).some(p=>p.x>0&&p.x<200&&p.y>320&&p.y<520)).toBe(false);
});

import {it,expect} from 'vitest';
import {communicationColumns,columnCurve} from './communicationLayout';
import {matchesTraffic} from './trafficFilter';
it('orders two columns without reverse-route crossings and keeps fan-out ports distinct',()=>{
 const edges=[{from:'a',to:'b'},{from:'b',to:'a'}];const {senders,recipients}=communicationColumns(edges);
 expect(senders).toEqual(['a','b']);expect(recipients).toEqual(['b','a']);expect(communicationColumns([...edges].reverse())).toEqual({senders,recipients});
 const fan=[{from:'a',to:'b'},{from:'a',to:'c'}];const columns=communicationColumns(fan);
 expect(columnCurve(fan[0],fan,columns.senders,columns.recipients)).not.toEqual(columnCurve(fan[1],fan,columns.senders,columns.recipients));
});
it('matches sender, recipient, directed and bidirectional pairs, including fan-in without duplication',()=>{
 const m={from:['a','c'],to:'b'},reverse={from:['b'],to:'a'};
 expect(matchesTraffic(m,{direction:'outbound',from:'c',to:''})).toBe(true);
 expect(matchesTraffic(m,{direction:'inbound',from:'',to:'a'})).toBe(false);
 expect(matchesTraffic(reverse,{direction:'one-way',from:'a',to:'b'})).toBe(false);
 expect(matchesTraffic(reverse,{direction:'two-way',from:'a',to:'b'})).toBe(true);
});

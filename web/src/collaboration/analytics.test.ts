import {describe,it,expect} from 'vitest';
import {ev} from '../test-fixtures';
import {communicationStats,percentile,trafficBins} from './analytics';
describe('captured traffic analytics',()=>{
  it('deduplicates, attributes peers, separates context and joins acknowledgements',()=>{
    const message=ev(1,{type:'message-queued',message_id:'m',intent:'inform',text:'Team architecture (operator configuration): context\n\n--- Current message ---\né'},'dev.b@r');message.actor={kind:'seat',id:'dev.a@r'};message.at_ms=100;
    const delivered=ev(2,{type:'message-delivered',message_id:'m'});delivered.at_ms=150;
    const read=ev(3,{type:'message-consumed',message_id:'m',turn_id:'t'});read.at_ms=200;
    const stats=communicationStats([read,message,delivered,message]);
    expect(stats.rows).toHaveLength(1);expect(stats.rows[0]).toMatchObject({from:['dev.a@r'],to:'dev.b@r',text:'é',delivered:150,read:200});
    expect(stats.bytes).toBeGreaterThan(stats.contextBytes+2);expect(stats.routes[0].latency).toEqual([50]);
    expect(communicationStats([message],101).rows).toHaveLength(0);expect(communicationStats([message],0,'other').rows).toHaveLength(0);
  });
  it('keeps missing receipt history and absent usage unknown; counts fan-in once globally',()=>{
    const m=ev(2,{type:'message-queued',message_id:'m',intent:'inform',text:'work'});
    const h=ev(3,{type:'handed-over',start_seq:1,message_id:'m',from:[{seat:'a',turn_id:'t',turn_seq:1,requested_seq:null},{seat:'b',turn_id:'u',turn_seq:1,requested_seq:null}],resend_of:null,wave:null});
    const s=communicationStats([m,h,ev(4,{type:'message-delivered',message_id:'outside'})]);
    expect(s.rows).toHaveLength(1);expect(s.routes).toHaveLength(2);expect(s.orphanReceipts).toBe(1);expect(s.usage.reports).toBe(0);expect(percentile([],0.95)).toBeNull();
    expect(trafficBins(s.rows,m.at_ms,m.at_ms,30).reduce((n,b)=>n+b.count,0)).toBe(1);
  });
});

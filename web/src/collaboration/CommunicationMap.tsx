import {useId,type KeyboardEvent} from 'react';
import {columnCurve,communicationColumns} from './communicationLayout';
type Route={key:string;from:string;to:string;count:number};
export function CommunicationMap({routes,name,onPair,onSender,onRecipient}:{routes:Route[];name:(id:string)=>string;onPair:(from:string,to:string)=>void;onSender:(id:string)=>void;onRecipient:(id:string)=>void}) {
  const marker=useId().replace(/:/g,'');
  const {senders,recipients}=communicationColumns(routes),height=Math.max(130,Math.max(senders.length,recipients.length)*44+42);
  const activate=(e:KeyboardEvent,action:()=>void)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action();}};
  return <div className="traffic-network traffic-columns" role="region" aria-label="Communication map"><svg viewBox={`0 0 680 ${height}`} style={{width:'100%',minWidth:560,height:'auto'}}>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 L2.5,5 z" fill="currentColor"/></marker></defs>
    <text x="18" y="23" className="traffic-column-heading">Senders · outbound</text><text x="496" y="23" className="traffic-column-heading">Recipients · inbound</text>
    {routes.filter(r=>senders.includes(r.from)&&recipients.includes(r.to)).map(r=>{const d=columnCurve(r,routes,senders,recipients);return <g key={r.key} className="traffic-map-route" role="button" tabIndex={0} aria-label={`Filter pair ${name(r.from)} → ${name(r.to)}: ${r.count} messages`} onClick={()=>onPair(r.from,r.to)} onKeyDown={e=>activate(e,()=>onPair(r.from,r.to))}><path d={d} className="traffic-hit"/><path d={d} fill="none" stroke="currentColor" strokeWidth={Math.min(5,1+Math.log2(r.count+1))} markerEnd={`url(#${marker})`}/><title>{name(r.from)} → {name(r.to)}: {r.count}</title></g>})}
    {[{ids:senders,x:12,action:onSender,label:'outbound from'},{ids:recipients,x:488,action:onRecipient,label:'inbound to'}].map(column=>column.ids.map((id,i)=><g key={`${column.label}:${id}`} className="traffic-map-node" role="button" tabIndex={0} aria-label={`Map ${column.label} ${name(id)}`} onClick={()=>column.action(id)} onKeyDown={e=>activate(e,()=>column.action(id))}><rect x={column.x} y={36+i*44} width="180" height="36" rx="6"/><text x={column.x+9} y={59+i*44}>{name(id).length>23?name(id).slice(0,22)+'…':name(id)}</text><title>{name(id)}</title></g>))}
  </svg>{!routes.length&&<p>No matching communication routes.</p>}</div>;
}

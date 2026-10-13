type Route = {from:string;to:string};
/** Two fixed columns. Ordering depends on topology, never message counts or status. */
export function communicationColumns(routes:Route[]) {
  // Retain communication hubs when the visible map is bounded. Traffic volume is irrelevant.
  const degree=(id:string,side:'from'|'to')=>new Set(routes.filter(r=>r[side]===id).map(r=>r[side==='from'?'to':'from'])).size;
  const visible=(side:'from'|'to')=>[...new Set(routes.map(r=>r[side]))].sort((a,b)=>degree(b,side)-degree(a,side)||a.localeCompare(b)).slice(0,16).sort();
  const senders=visible('from'),recipients=visible('to');
  const edges=routes.filter(r=>senders.includes(r.from)&&recipients.includes(r.to));
  const centre=(id:string)=>{const upstream=edges.filter(r=>r.to===id).map(r=>senders.indexOf(r.from));return upstream.length?upstream.reduce((n,v)=>n+v,0)/upstream.length:Infinity;};
  recipients.sort((a,b)=>centre(a)-centre(b)||a.localeCompare(b));
  return {senders,recipients};
}
/** Separate connection ports for each route; arrows always read left to right. */
export function columnCurve(route:Route,routes:Route[],senders:string[],recipients:string[]) {
  const outgoing=routes.filter(r=>r.from===route.from&&recipients.includes(r.to)).sort((a,b)=>recipients.indexOf(a.to)-recipients.indexOf(b.to));
  const incoming=routes.filter(r=>r.to===route.to&&senders.includes(r.from)).sort((a,b)=>senders.indexOf(a.from)-senders.indexOf(b.from));
  const port=(list:Route[])=>list.length<2?0:-12+24*list.findIndex(r=>r.from===route.from&&r.to===route.to)/(list.length-1);
  const y1=54+senders.indexOf(route.from)*44+port(outgoing),y2=54+recipients.indexOf(route.to)*44+port(incoming);
  return `M 202 ${y1} C 302 ${y1}, 378 ${y2}, 478 ${y2}`;
}

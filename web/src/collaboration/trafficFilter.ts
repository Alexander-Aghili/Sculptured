export type TrafficFilter = {direction:'all'|'outbound'|'inbound'|'one-way'|'two-way';from:string;to:string};
/** Fan-in messages match any recorded sender, with each message retained only once. */
export function matchesTraffic(m:{from:string[];to:string},f:TrafficFilter) {
  if(f.direction==='outbound')return m.from.includes(f.from);
  if(f.direction==='inbound')return m.to===f.to;
  if(f.direction==='one-way'||f.direction==='two-way')return (m.from.includes(f.from)&&m.to===f.to)||(f.direction==='two-way'&&m.from.includes(f.to)&&m.to===f.from);
  return true;
}

import { track } from '../hosted/analytics';
import {useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {api} from '../api';
import type {DeploymentRun} from '../generated/DeploymentRun';
import type {DeploymentHistory} from '../generated/DeploymentHistory';
import type {DeploymentAgent} from '../generated/DeploymentAgent';
import type {EventRecord} from '../generated/EventRecord';
import {parentForest,subtreeIds,treeLayout} from '../release/treeLayout';
import {CARD_H,CARD_W,COL_GAP,POD_PAD,type Layout} from '../layout';
import {routeEdges} from '../shell/edgeGeometry';
import {usePanZoom} from '../shell/viewport';
import {DismissibleError} from '../shell/DismissibleError';
const date=(ms:number|null)=>ms===null?'Unknown':new Date(ms).toLocaleString();
const SOURCES:Record<string,string>={'sculptured':'Sculptured','imported:claude-code':'Claude Code','imported:codex':'Codex'};
const sourceName=(s:string)=>SOURCES[s]??s;
const runLabel=(r:DeploymentRun)=>r.source?`Imported · ${sourceName(r.source)} · ${date(r.started_ms)}`:`${date(r.started_ms)} · #${r.start_seq}`;
const label=(a:DeploymentAgent)=>a.name ?? `${a.id.split('@')[0]} (name not recorded)`;
export function DeploymentHistoryView({rig}:{rig:string}) {
  const [params,setParams]=useSearchParams();
  const requested=Number(params.get('run')) || undefined;
  const root=params.get('history_subtree') ?? '';
  const [runs,setRuns]=useState<DeploymentRun[]>([]),[older,setOlder]=useState(false),[loadingRuns,setLoadingRuns]=useState(true);
  const [data,setData]=useState<DeploymentHistory|null>(null),[error,setError]=useState('');
  const [selected,setSelected]=useState(''),[list,setList]=useState(false);
  const seq=requested ?? runs[0]?.start_seq;
  const navigate=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set(key,value);else next.delete(key);if(key==='run')next.delete('history_subtree');return next;});
  useEffect(()=>{let active=true;setLoadingRuns(true);setRuns([]);api.deployments(rig).then(items=>{if(active){setRuns(items);setOlder(items.length===50);setLoadingRuns(false);}},()=>{if(active){setError('Could not load deployment history.');setLoadingRuns(false);}});return()=>{active=false};},[rig]);
  useEffect(()=>{let active=true;setData(null);setSelected('');if(seq)api.deployment(rig,seq).then(value=>{if(active){setData(value);setError('');}},()=>{if(active)setError('Could not load this deployment.');});return()=>{active=false};},[rig,seq]);
  return <div className="deployment-history">
    <div className="subtree-controls">
      <label>Deployment <select aria-label="Historical deployment" value={seq ?? ''} onChange={e=>navigate('run',e.target.value)}>
        {requested&&!runs.some(r=>r.start_seq===requested)&&<option value={requested}>Run #{requested}</option>}
        {runs.map(r=><option key={r.start_seq} value={r.start_seq}>{runLabel(r)}</option>)}
      </select></label>
      {older&&<button className="btn" onClick={async()=>{try{const next=await api.deployments(rig,runs.at(-1)!.start_seq);setRuns([...runs,...next]);setOlder(next.length===50);}catch{setError('Could not load older deployments.');}}}>Load older runs</button>}
      {data&&<label>Subtree <select aria-label="Historical subtree" value={root} onChange={e=>navigate('history_subtree',e.target.value)}>
        <option value="">Whole deployment</option>{data.agents.map(a=><option key={a.id} value={a.id}>{label(a)}</option>)}
      </select></label>}
      {root&&<button className="btn" onClick={()=>navigate('history_subtree','')}>Whole deployment</button>}
      <button className="btn" aria-pressed={list} onClick={()=>setList(!list)}>{list?'Graph':'List'}</button>
      {seq!==undefined&&<a className="btn" href={api.runFileUrl(rig,seq)} download onClick={()=>track('download-run')}>Download run</a>}
    </div>
    {data?.run.source&&<p className="live-evidence-note">Imported from a file ({sourceName(data.run.source)}). Shown as recorded in the file; it did not run here.</p>}
    <p className="live-evidence-note">Recorded history · includes stopped and removed agents. Status means last observed in this run, not current activity.</p>
    {error&&<DismissibleError message={error}/>}
    {loadingRuns&&<p role="status">Loading deployments…</p>}
    {!loadingRuns&&!runs.length&&!error&&<p>No recorded deployments yet.</p>}
    {seq&&!data&&!error&&<p role="status">Loading deployment…</p>}
    {data&&<>
      <p className="live-evidence-note">{data.agents.length} agents · Started {date(data.run.started_ms)} · Stop requested: {date(data.stopped_ms)}. {data.has_snapshot?'Saved configuration and recorded events.':'Recovered from recorded events; original configuration and some names were not retained.'}{data.summary_truncated?' Summary capped at 50,000 deployment events; raw history remains paginated below.':''}</p>
      <div className="history-body">
        <HistoryTree key={`${rig}:${seq}`} rig={rig} data={data} root={root} list={list} selected={selected} onSelect={setSelected}/>
        {selected&&<HistoryEvidence key={`${rig}:${seq}:${selected}`} rig={rig} seq={seq!} agent={data.agents.find(a=>a.id===selected)!} onClose={()=>setSelected('')}/>}</div>
    </>}
  </div>;
}
function HistoryTree({rig,data,root,list,selected,onSelect}:{rig:string;data:DeploymentHistory;root:string;list:boolean;selected:string;onSelect:(id:string)=>void}) {
  const topology=useMemo(()=>({seats:data.agents.map(a=>({id:a.id,pod:'history'})),pods:[{id:'history'}]}),[data]);
  const links=useMemo(()=>parentForest(topology,data.agents.flatMap(a=>a.parent?[{parent:a.parent,child:a.id}]:[])),[data,topology]);
  const scope=root?subtreeIds(topology,links,root):new Set(data.agents.map(a=>a.id));
  const nodes=data.agents.filter(a=>scope.has(a.id));
  const family=links.filter(l=>scope.has(l.child)&&scope.has(l.parent));
  const subset={...topology,seats:topology.seats.filter(s=>scope.has(s.id))};
  const fallback:Layout={pods:{},seats:Object.fromEntries(nodes.map((a,i)=>[a.id,{x:POD_PAD+i*(CARD_W+COL_GAP),y:POD_PAD,w:CARD_W,h:CARD_H}])),width:nodes.length*(CARD_W+COL_GAP),height:CARD_H+2*POD_PAD};
  const layout=treeLayout(fallback,subset,family);
  const {el,vp,fit,zoomAt,startPan,reveal}=usePanZoom(`${rig}:history:${data.run.start_seq}:${root}`,{x0:0,y0:0,x1:layout.width,y1:layout.height});
  const edges=family.map(l=>({from:l.parent,to:l.child,kind:'spawned_by' as const,enforced:true}));
  const routes=routeEdges(edges,layout.seats);
  const summary=(a:DeploymentAgent)=><><strong>{label(a)}</strong><span>{a.lifecycle ? `Session ${a.lifecycle}` : 'Session status unknown'} · last observed</span><span>{a.runtime ?? 'Runtime unknown'}</span><span>{a.output_tokens===null?'Output usage unknown':`${a.output_tokens.toLocaleString()} output tokens`}</span><span>Launched {date(a.launched_ms)}</span></>;
  if(!nodes.length)return <p>No agents in this historical subtree. Choose Whole deployment to return.</p>;
  if(list) return <ul className="history-list">{nodes.map(a=><li key={a.id}><button onClick={()=>onSelect(a.id)}>{summary(a)}<span>Parent: {a.parent?label(data.agents.find(p=>p.id===a.parent)!):'No recorded parent'}</span></button></li>)}</ul>;
  return <div className="history-graph"><div className="history-zoom"><button className="btn" onClick={()=>zoomAt(.8)}>−</button><button className="btn" onClick={()=>zoomAt(1.25)}>+</button><button className="btn" onClick={fit}>Fit history</button></div>
    <div ref={el} className="graph-viewport" onPointerDown={e=>{if(e.button===0&&!(e.target as HTMLElement).closest('button'))startPan(e);}}>
      <div className="graph-world" style={{transform:`translate(${vp.x}px,${vp.y}px) scale(${vp.k})`,width:layout.width,height:layout.height}}>
        <svg className="edges" width={layout.width} height={layout.height} aria-hidden="true"><defs><marker id="history-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" className="arrow-head"/></marker></defs>
        {edges.map(l=><path key={l.to} className="edge enforced" d={routes.get(l)?.d} markerEnd="url(#history-arrow)"/>)}</svg>
        {nodes.map(a=>{const b=layout.seats[a.id];return <button key={a.id} className="history-agent" aria-label={`Inspect historical ${label(a)}`} aria-pressed={selected===a.id} style={{left:b.x,top:b.y,width:b.w,height:b.h}} onClick={()=>onSelect(a.id)} onFocus={()=>reveal(b)}>{summary(a)}</button>})}
      </div></div></div>;
}
function HistoryEvidence({rig,seq,agent,onClose}:{rig:string;seq:number;agent:DeploymentAgent;onClose:()=>void}) {
  const [events,setEvents]=useState<EventRecord[]>([]),[more,setMore]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  useEffect(()=>{let active=true;api.deploymentEvents(rig,seq,agent.id).then(page=>{if(active){setEvents(page.events);setMore(page.has_more);setBusy(false);}},()=>{if(active){setError('Could not load recorded events.');setBusy(false);}});return()=>{active=false};},[rig,seq,agent.id]);
  return <aside className="history-evidence" aria-label="Historical agent evidence"><button className="btn" onClick={onClose}>Close evidence</button><h3>{label(agent)}</h3><p>{agent.id}</p><p>Raw events from this deployment only. Agent text is reported, not independently verified.</p>{error&&<DismissibleError message={error}/>}{busy&&<p>Loading events…</p>}
    {events.map(e=><details key={e.seq}><summary>{date(e.at_ms)} · {e.body.type} · {e.provenance}</summary><pre>{JSON.stringify(e.body,null,2)}</pre></details>)}
    {more&&<button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{const p=await api.deploymentEvents(rig,seq,agent.id,events.at(-1)!.seq);setEvents([...events,...p.events]);setMore(p.has_more);}catch{setError('Could not load older events.');}finally{setBusy(false);}}}>Load older events</button>}
  </aside>;
}

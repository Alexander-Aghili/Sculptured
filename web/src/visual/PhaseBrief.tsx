import {Markdown} from '../shell/Markdown';
import {useState} from 'react';
import {splitTeamMessage} from '../teamMessage';
import type {Phase,Step} from './process';
export function workMessage(text:string):string {
  return splitTeamMessage(text).text.replace(/^Per-agent budget:[^\n]*\n\n/,'').replace(/^You are a managed subagent of [^\n]+?\. Your assignment: /,'').replace(/\nUse team_status to find teammates\. Report progress or your result to your parent using send_agent_message\. Own only assigned files\. Use spawn_agent for tracked children, never an untracked native\/background agent\. When finished, send your result and end your turn; the operator can stop your idle session\.$/,'');
}
export type BriefPart={id:string;title:string;text:string;tier:string;keys:string[];tools:Step[]};
/** Extract explicit statements only. No model calls, inferred intent, or invented reasoning. */
export function phaseBrief(p:Phase):BriefPart[] {
  const statements=p.explanations??(p.reply?[p.reply]:[]);
  const find=(pattern:RegExp,exclude?:RegExp)=>{for(const r of [...statements].reverse()){const lines=r.text.split(/\n|(?<=[.!?])\s+/);for(let i=0;i<lines.length;i++)if(pattern.test(lines[i])&&!exclude?.test(lines[i]))return {text:[lines[i],...(/^\s*(?:#+\s*)?(?:\*\*)?[^:]{1,35}:?(?:\*\*)?\s*$/.test(lines[i])?lines.slice(i+1,i+3):[])].join('\n').trim(),key:r.key};}return null;};
  const goal=p.goal??p.triggers[0],challenges=find(/\b(challenges?|blockers?|blocked|could not|failed|unable|issue encountered)\b/i,/^\s*(?:[-*]\s*)?(?:no (?:known |remaining )?(?:blockers?|challenges?|issues?)(?: reported| remain)?|blockers?:?\s*(?:none|no)|not blocked)[.!]?\s*$/i),done=find(/\b(accomplished|completed|implemented|added|fixed|verified|built|created)\b/i),next=find(/\b(next steps?|next:|will next|remaining work|follow.up|waiting for|awaiting)\b/i),why=find(/\b(because|rationale|reason:|so that|in order to|why:)\b/i);
  const failed=p.steps.filter(s=>s.status==='error');
  const report=(id:string,title:string,r:{text:string;key:string}|null,tools:Step[],fallback:string):BriefPart=>({id,title,text:r?.text??fallback,tier:r?'Agent-reported excerpt':'Unknown',keys:r?[r.key]:[],tools});
  return [
    {id:'goal',title:'Goal',text:goal?workMessage(goal.text):'No goal message captured for this turn.',tier:goal?'Recorded request':'Unknown',keys:goal?[goal.key]:[],tools:p.steps},
    challenges?report('challenges','Challenges',challenges,failed,''):failed.length?{id:'challenges',title:'Challenges',text:failed.map(s=>`${s.name}: ${s.summary} — error result`).join('\n'),tier:'Captured tool results',keys:failed.map(s=>s.key),tools:failed}:report('challenges','Challenges',null,[],'No challenge statement or failed tool result captured.'),
    report('accomplished','Accomplished',done,p.steps.filter(s=>s.status==='ok'),'No accomplishment statement captured. Successful tools alone do not verify the goal.'),
    report('next','Next steps',next,p.steps.filter(s=>s.status==='running'),'Next steps have not been stated in captured messages.'),
    report('why','Why',why,p.steps,'No rationale stated in captured messages.'),
  ];
}
export function PhaseBrief({phase,onJump}:{phase:Phase;onJump:(key:string)=>void}) {
  const [selected,setSelected]=useState<string|null>(null),parts=phaseBrief(phase).filter(p=>p.tier!=='Unknown'),part=parts.find(x=>x.id===selected);
  const label:Record<string,string>={goal:'Working on',challenges:'Needs attention',accomplished:'Reported progress',next:'Next action',why:'Stated rationale'};
  return <section className="phase-brief" aria-label={`Turn ${phase.n} work summary`}>
    <ul className="phase-activity-list">{parts.map(p=><li key={p.id}><button className={`phase-activity brief-${p.id}`} aria-label={`Inspect ${p.title.toLowerCase()} for turn ${phase.n}`} aria-expanded={selected===p.id} onClick={()=>setSelected(selected===p.id?null:p.id)}><strong>{label[p.id]}</strong><span>{p.text.length>260?p.text.slice(0,257)+'…':p.text}</span><small>{p.id==='accomplished'?'Agent report · inspect evidence':'Inspect'}</small></button></li>)}</ul>
    {!parts.length&&<p className="vp-note">No work summary captured yet. Tool activity and the transcript remain available below.</p>}
    {phase.reply&&!parts.some(p=>p.keys.includes(phase.reply!.key))&&<details className="phase-latest"><summary>Latest agent update</summary><Markdown text={phase.reply.text}/><button className="link-btn" onClick={()=>onJump(phase.reply!.key)}>Open source in transcript</button></details>}
    {part&&<div className="phase-brief-evidence" role="region" aria-label={`${part.title} evidence for turn ${phase.n}`}><header><strong>{part.title} · {part.tier}</strong><button className="btn" onClick={()=>setSelected(null)}>Close detail</button></header><p className="vp-note">Excerpts from recorded messages and tool results. Completion claims are not independent verification.</p><Markdown text={part.text}/>{part.keys.map(key=><button key={key} className="link-btn" onClick={()=>onJump(key)}>Open source in transcript</button>)}
      <h4>{part.id==='goal'||part.id==='why'?'Tools captured in this turn':'Related captured tools'} · {part.tools.length}</h4>{!part.tools.length&&<p>No captured tools associated with this section.</p>}{part.tools.map(s=><details key={s.key}><summary>{s.name} · {s.status} · {s.summary}</summary><p>Captured tool call{part.id==='goal'||part.id==='why'?' · turn context; a causal link to this statement is not established':''}</p><pre>{JSON.stringify(s.input,null,2)}</pre><pre>{s.output??'No result captured yet.'}</pre><button className="link-btn" onClick={()=>onJump(s.key)}>Open tool in transcript</button></details>)}
      <details><summary>Recorded agent explanations</summary>{(phase.explanations??(phase.reply?[phase.reply]:[])).map(r=><div key={r.key}><Markdown text={r.text}/><button className="link-btn" onClick={()=>onJump(r.key)}>Open explanation in transcript</button></div>)}{!phase.reply&&<p>No explanation captured.</p>}</details>
    </div>}
  </section>;
}

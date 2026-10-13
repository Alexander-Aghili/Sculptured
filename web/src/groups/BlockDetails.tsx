import { useState } from 'react';
import type { GroupBlock } from '../generated/GroupBlock';
import type { Selection } from '../draft/edits';
import { StructureCanvas } from '../structure/StructureCanvas';
import { Markdown } from '../shell/Markdown';
import type { WorkflowTarget } from '../workflow/WorkflowGraph';
import '../shell/chat.css';
import './groups.css';

/** The actual board, with read-only selection and an accessible list of every component. */
export function BlockDetails({block}:{block:GroupBlock}) {
  const [selection,setSelection]=useState<Selection|null>(null);
  const [target,setTarget]=useState<WorkflowTarget|null>(null);
  const d=block.draft;
  const agent=selection?.kind==='agent'?d.agents.find(a=>a.id===selection.id):null;
  const connection=selection?.kind==='connection'?d.connections.find(c=>c.id===selection.id):null;
  const stage=target&&typeof target==='object'&&'stage' in target?d.workflow?.stages.find(s=>s.id===target.stage):null;
  const name=(id:string)=>d.agents.find(a=>a.id===id)?.name??id;
  const select=(s:Selection|null)=>{setSelection(s);setTarget(null);};
  return <div className="block-inspection">
    <div className="block-inspection-board sb-stage">
      <StructureCanvas groupOnly teamId={`inspect:${block.id}`} draft={d} issues={[]} selection={selection} onSelect={select} onInspect={select} onOpen={id=>select({kind:'agent',id})} onOpenAgent={id=>select({kind:'agent',id})} onWorkflow={t=>{setTarget(t);setSelection(null);}} edit={()=>null} locked canUndo={false} canRedo={false} onUndo={()=>{}} onRedo={()=>{}} />
    </div>
    <nav className="block-component-list" aria-label="Block components">
      {d.agents.map(a=><button key={a.id} className="btn" aria-pressed={agent?.id===a.id} onClick={()=>select({kind:'agent',id:a.id})}>{a.name}</button>)}
      {d.connections.map(c=><button key={c.id} className="btn" aria-pressed={connection?.id===c.id} onClick={()=>select({kind:'connection',id:c.id})}>{name(c.from)} → {name(c.to)}</button>)}
      {d.workflow?.stages.map(s=><button key={s.id} className="btn" aria-pressed={stage?.id===s.id} onClick={()=>{setSelection(null);setTarget({stage:s.id});}}>{s.name}</button>)}
    </nav>
    <section className="block-component-detail" aria-live="polite" aria-label="Selected component">
      {agent?<><h3>{agent.name}</h3><p className="muted">{agent.kind} agent · inherits the project folder</p><ReadableInstructions text={agent.job}/><details><summary>Agent configuration</summary><pre>{JSON.stringify(agent.advanced,null,2)}</pre></details></>
      :connection?<><h3>{name(connection.from)} → {name(connection.to)}</h3><p>{connection.kind==='hands-work-to'?'Hands completed work to the recipient.':connection.kind==='reports-to'?'Reports to this agent. Coordination uses managed messages.':'Watches this agent. Coordination uses managed messages.'}</p></>
      :stage?<><h3>{stage.name}</h3><p>Responsible agent: {name(stage.agent)}</p><ul>{Object.entries(stage.routes).map(([outcome,to])=><li key={outcome}>{outcome} → {to?d.workflow?.stages.find(s=>s.id===to)?.name??to:'Complete'}</li>)}</ul><details><summary>Full stage configuration</summary><pre>{JSON.stringify(stage,null,2)}</pre></details></>
      :target&&d.workflow?<><h3>Workflow input</h3><Markdown text={d.workflow.input||'The project supplies its input when you run it.'}/></>
      :<p className="muted">Select an agent or arrow on the board, or choose a component above, to inspect its instructions and configuration.</p>}
    </section>
  </div>;
}

/** Lead with the author's overview; keep provenance and operation notes one click away. */
export function BlockDescription({text}:{text:string}) {
  const formatted=text.replace(/\bRig Control\b/g,'Sculptured').replace(/Architecture reference: (.+?), slide (\d+): (https:\/\/[^\s]+?)(?:\.)? Original Sculptured instructions, not course-provided code or an endorsement\. Reports-to\/watch arrows describe intent; agents use managed messages to coordinate\. Imported blocks require a folder and review; no agents start on import\./g,
    (_,title,slide,url)=>`**Architecture reference:** [${title} · slide ${slide}](${url.replace(/\.$/,'')})\n\nOriginal Sculptured instructions; the course did not supply this code or endorse it.\n\n- Reports-to and watch arrows describe intent. Agents coordinate through managed messages.\n- Choose a project folder and review instructions before starting.\n- Importing a block does not start agents.`);
  const paragraphs=formatted.split(/\n\s*\n/).filter(Boolean);
  return <div className="block-description"><Markdown text={paragraphs[0]??''}/>{paragraphs.length>1&&<details><summary>Background, source & usage notes</summary>{paragraphs.slice(1).map((p,i)=><Markdown key={i} text={p}/>)}</details>}</div>;
}
export function BlockFeatures({block}:{block:GroupBlock}) {
  const d=block.draft;
  return <ul className="block-features"><li>{d.agents.length} agent roles: {d.agents.slice(0,4).map(a=>a.name).join(', ')+(d.agents.length>4?` and ${d.agents.length-4} more`:'')||'ready to design'}</li><li>{d.workflow?`${d.workflow.stages.length} workflow stages with outcome routing`:`${d.connections.filter(c=>c.kind==='hands-work-to').length} handoffs · ${d.connections.filter(c=>c.kind!=='hands-work-to').length} coordination links`}</li><li>Editable copy · inherits your project folder</li></ul>;
}

function ReadableInstructions({text}:{text:string}) {
  if(text.length<500||/\n\s*\n|^[-#*]|```/m.test(text))return <Markdown text={text}/>;
  const sentences=text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if(sentences.length<3)return <Markdown text={text}/>;
  return <div className="block-instructions"><Markdown text={sentences[0]}/><ul>{sentences.slice(1).map((sentence,i)=><li key={i}><Markdown text={sentence}/></li>)}</ul></div>;
}

import { track } from '../hosted/analytics';
import { CliAccounts } from './CliAccounts';
import {DismissibleError} from './DismissibleError';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { errorText } from '../errors';
import type { ProjectVisibilityStatus } from '../generated/ProjectVisibilityStatus';
import { shortAge, STATES, type StateKey } from '../herdr';
import { agentPath, type AgentRow, type TeamRow } from './model';
import { Badge, Btn, Icon, StateMark, VendorMark, WaitingMark } from './ui';
import { plural } from '../format';
import { BrandMark } from './BrandMark';
import { useHosted } from '../hosted/HostedGate';
import { gw } from '../hosted/session';

/** Hosted beta: who is signed in, Admin (admins only) and Sign out. Nothing in local mode. */
function HostedAccount() {
  const s = useHosted();
  if (s.kind !== 'signed-in') return null;
  return (
    <div className="hosted-account">
      <span className="muted" title={s.user.email}>{s.user.name}</span>
      <Link to="/computers" onClick={() => track('open-computers')}>Computers</Link>
      {s.user.role === 'admin' && <Link to="/admin">Admin</Link>}
      <Link to="/what-we-record">What we record</Link>
      <button type="button" className="link-btn" onClick={() => void gw('POST', '/logout').finally(() => window.location.assign('/login'))}>Sign out</button>
    </div>
  );
}

/** States a team header counts, most urgent first. */
const ROLLUP: StateKey[] = ['needs-you', 'stuck', 'failed', 'working', 'done'];
const count = (team: TeamRow, k: StateKey) => team.counts[k];

/** Agents of a team that wait on you: "needs you", or "stuck" (its handoffs cannot go on alone). */
export const attentionCount = (team: TeamRow) => count(team, 'needs-you') + count(team, 'stuck');

/** The roll-up in words: "1 needs you, 2 working", "not started", "6 agents, all stopped". */
export function rollupWords(team: TeamRow): string {
  if (team.draftOnly) return 'not started';
  if (!team.loaded) return team.connected ? 'loading' : 'connecting';
  const parts = ROLLUP.filter((k) => count(team, k) > 0);
  if (parts.length > 0) return parts.map((k) => `${count(team, k)} ${STATES[k].word}${STATES[k].tip ? ` (${STATES[k].tip})` : ''}`).join(', ');
  const n = team.agents.length;
  return `${plural(n, 'agent')}${n > 0 && count(team, 'stopped') === n ? ', all stopped' : ''}`;
}

function Rollup({ team, quiet = false }: { team: TeamRow; quiet?: boolean }) {
  const parts = ROLLUP.filter((k) => count(team, k) > 0);
  if (team.draftOnly) return <span className="rollup muted">not started</span>;
  if (!team.loaded) return <span className="rollup muted">{team.connected ? '' : 'connecting…'}</span>;
  // A collapsed project with nothing to count still says what it is.
  if (quiet && parts.length === 0) return <span className="rollup muted">{rollupWords(team)}</span>;
  return (
    <span className="rollup" title={parts.length ? rollupWords(team) : 'nothing needs you'}>
      {parts.map((k) => (
        <span key={k} className={`roll tone-${STATES[k].tone} st-${k}`}>
          <span aria-hidden="true" className={k === 'working' ? 'glyph spin' : undefined}>
            {STATES[k].glyph}
          </span>
          {count(team, k)}
          <span className="sr-only"> {STATES[k].word}</span>
        </span>
      ))}
    </span>
  );
}

export function AgentRowLink({ a, selected, current, now }: { a: AgentRow; selected: boolean; current: boolean; now: number }) {
  return (
    <Link
      to={a.href ?? agentPath(a.rig, a.id)}
      className={`agent-row ${a.vendor.cls} tone-row-${a.state.tone}${selected ? ' selected' : ''}${current ? ' current' : ''}${a.state.key === 'idle' && a.lastMs !== null && now - a.lastMs > 2 * 3_600_000 ? ' dim' : ''}`}
      aria-label={`${a.name} — ${a.waitingFor?.length || a.state.key === 'stuck' ? a.summary : a.state.word}`}
      aria-current={current ? 'page' : undefined}
      data-agent={a.id}
    >
      <StateMark state={a.state} word={false} />
      <VendorMark v={a.vendor} />
      <span className="row-name">{a.name}</span>
      {a.waitingFor?.length && a.state.key !== 'stuck' ? (
        <WaitingMark names={a.waitingFor} className="row-summary" />
      ) : (
        <span className={`row-summary tone-${a.state.key === 'working' ? 'vendor' : a.state.tone}`}>{a.summary}</span>
      )}
      <span className="row-age">{a.href ? '' : shortAge(a.lastMs, now)}</span>
    </Link>
  );
}

type Props = {
  teams: TeamRow[];
  selected?: string;
  currentAgent?: string;
  currentRig?: string;
  /** The current project: the one team whose agents are listed. Every other team is one row. */
  project?: string;
  now: number;
  listError?: string | null;
  /** Full-width home list on narrow screens. */
  asHome?: boolean;
  onNewTeam?: () => void;
};

export function Sidebar({ teams, selected, currentAgent, currentRig, project, now, listError, asHome, onNewTeam }: Props) {
  const navigate=useNavigate();
  const [visibility,setVisibility]=useState<Record<string,ProjectVisibilityStatus>>({}),[visibilityError,setVisibilityError]=useState(''),[visibilityLoadError,setVisibilityLoadError]=useState(''),[busy,setBusy]=useState<string|null>(null);
  useEffect(()=>{api.projectVisibility().then(rows=>setVisibility(Object.fromEntries(rows.map(r=>[r.id,r.status]))),()=>setVisibilityLoadError('Could not load hidden projects. Reload to try again.'));},[]);
  const changeVisibility=async(id:string,status:ProjectVisibilityStatus)=>{
    setBusy(id);setVisibilityError('');
    try {await api.setProjectVisibility(id,status);setVisibility(old=>({...old,[id]:status}));window.dispatchEvent(new Event('project-visibility-changed'));if(status==='trashed'&&(id===currentRig||id===project))navigate('/?all');}
    catch(e){setVisibilityError(errorText(e));}finally{setBusy(null);}
  };
  const visibleTeams=teams.filter(t=>!visibility[t.rig]||visibility[t.rig]==='visible');
  const listRef = useRef<HTMLDivElement>(null);
  const [expanded,setExpanded]=useState<Record<string,boolean>>(()=>{try{return JSON.parse(localStorage.getItem("sculptured.sidebar.expanded") ?? "{}")}catch{return {}}});
  const toggle=(id:string,open:boolean)=>setExpanded(old=>{const next={...old,[id]:!open};try{localStorage.setItem("sculptured.sidebar.expanded",JSON.stringify(next))}catch{/* Session only */}return next});
  // Keep the keyboard selection in view as j/k moves it.
  useEffect(() => {
    if (!selected) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-agent="${CSS.escape(selected)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);
  return (
    <nav id="workspace-projects" className={`sidebar panel${asHome ? ' as-home' : ''}`} aria-label="Agents">
      <div className="panel-bar">
        <BrandMark />
        <span className="panel-title">Projects</span>
        <span className="panel-rule" aria-hidden="true" />
        <span className="panel-tools">
          <Badge title={plural(visibleTeams.length, 'project')}>{visibleTeams.length}</Badge>
          {onNewTeam && (
            <Btn size="sm" icon="plus" onClick={onNewTeam} className="new-project" aria-label="New project">
              New
            </Btn>
          )}
        </span>
      </div>
      <div className="sidebar-list" ref={listRef}>
        {listError && (
          <DismissibleError className="side-note tone-red">
            Could not load teams: {listError}
          </DismissibleError>
        )}
        {visibilityLoadError&&<p className="side-note muted">{visibilityLoadError}</p>}
        {visibilityError&&<DismissibleError>{visibilityError}</DismissibleError>}
        {visibleTeams.length === 0 && !listError && <p className="side-note muted">No teams yet.</p>}
        {visibleTeams.map((t) => {
          const open = expanded[t.rig] ?? t.rig === project;
          const needs = attentionCount(t) > 0;
          return (
            <section
              key={t.rig}
              className={`team-group${open ? ' open' : ' closed'}${t.draftOnly ? ' draft-only' : ''}${needs ? ' needs-you' : ''}`}
              aria-label={`team ${t.title}`}
              data-team={t.rig}
            >
              <div className={`team-head${t.rig === currentRig ? ' on-screen' : ''}`}>
                <button type="button" className="project-toggle" aria-label={`${open ? 'Close' : 'Open'} ${t.title} in sidebar`} aria-expanded={open} onClick={()=>toggle(t.rig,open)}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14}/></button>
                <Link to={t.href} className={`team-name${!open && needs ? " tone-row-red" : ""}`} aria-label={t.rig===project ? t.title : `Switch to ${t.title} — ${rollupWords(t)}`} aria-current={t.rig === currentRig && !currentAgent ? 'page' : undefined}><span className="project-title">{t.title}</span><Rollup team={t} quiet={!open} /></Link>
                <details className="project-menu"><summary aria-label={`Manage ${t.title}`} title="Project actions">•••</summary><div>
                  <button disabled={busy===t.rig} onClick={()=>void changeVisibility(t.rig,'hidden')}>Hide from sidebar</button>
                  <button disabled={busy===t.rig} onClick={()=>void changeVisibility(t.rig,'trashed')}>Move to Trash</button>
                  <small>Trash is restorable. Stop running agents first.</small>
                </div></details>
              </div>
              {open && <div className="team-rows">
                {t.loaded && t.agents.length === 0 && <p className="side-note muted">No agents.</p>}
                {t.agents.map(a=><AgentRowLink key={a.id} a={a} selected={selected===a.id} current={currentAgent===a.id} now={now}/>)}</div>}
            </section>
          );
        })}
        {(['hidden','trashed'] as const).map(status=>{
          const items=teams.filter(t=>visibility[t.rig]===status);
          return items.length>0&&<details className="project-storage" key={status}><summary>{status==='hidden'?'Hidden projects':'Trash'} ({items.length})</summary>
            {status==='trashed'&&<p className="muted">Drafts, files and history are retained.</p>}
            {items.map(t=><div key={t.rig}><span>{t.title}</span><button className="btn btn-sm" disabled={busy===t.rig} onClick={()=>void changeVisibility(t.rig,'visible')}>{status==='hidden'?'Show':'Restore'}</button></div>)}
          </details>;
        })}
      </div>
      <div className="sidebar-foot">
        {onNewTeam && (
          <Btn onClick={onNewTeam} kbd="n" icon="plus" className="new-team" aria-label="New project" tip="New project">
            New project
          </Btn>
        )}
        <span className="pane-spacer" />
        <Link to="/?all" className="side-all muted" data-tip="Every team on this machine">
          <Icon name="grid" size={14} />
          all teams
        </Link>
      </div>
      <div className="side-accounts">
        <CliAccounts />
        <HostedAccount />
      </div>
    </nav>
  );
}

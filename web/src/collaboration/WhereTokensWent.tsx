import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePolled } from '../usePolling';
import { agentPath } from '../shell/model';
import { Btn } from '../shell/ui';
import { tokens } from './UsageDashboard';
import { Causes, PlanWindows, Timeline } from './TokensCharts';
import { AgentsTable, Costliest, Latency, Sharing, type AgentLink } from './TokensTables';
import type { TokensReport } from '../tokensReport';
import './usage.css';

/** The member a seat id names (`pod.member@team` → `member`). */
const memberOf = (seat: string) => seat.split('@')[0].split('.').pop() ?? seat;

/** Links a report's agent id (a member, `member~2` for its second session) to the agent's page. */
export function agentLinker(rig: string, seats: string[], report: TokensReport | undefined): AgentLink {
  return (id) => {
    const name = report?.agents.find((a) => a.id === id)?.name ?? id;
    const seat = id.includes('/') ? undefined : seats.find((s) => memberOf(s) === id.split('~')[0]);
    return seat ? <Link to={agentPath(rig, seat)}>{name}</Link> : name;
  };
}

/** Where a run's tokens went: made by MAIS on the computer that ran the team, every minute while it runs. */
export function WhereTokensWent({ rig, start, seats, onClose }: { rig: string; start?: number; seats: string[]; onClose?: () => void }) {
  const { data, error } = usePolled(() => api.teamReport(rig, start), 60000, [rig, start]);
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus moves to the heading once, when the panel opens over the board; never on a later render.
  const overBoard = useRef(onClose !== undefined);
  useEffect(() => { if (overBoard.current) heading.current?.focus(); }, []);
  const r = data?.report;
  const agent = agentLinker(rig, seats, r);
  const name = (id: string) => r?.agents.find((a) => a.id === id)?.name ?? id;
  return (
    <section className="communication-dashboard usage-dashboard tokens-report" aria-label="Where tokens went" onKeyDown={(e) => { if (onClose && e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <header><h2 ref={heading} tabIndex={-1}>Where tokens went</h2>
        {data && <span className="muted">{data.running ? 'refreshed every minute' : 'after the run ended'} · made {new Date(data.at_ms).toLocaleTimeString()}</span>}
        {onClose && <Btn onClick={onClose}>Back to board</Btn>}</header>
      {error && <p role="alert" className="tone-red">{error}</p>}
      {data?.stale && <p role="status" className="tone-amber">Showing the report made {new Date(data.at_ms).toLocaleString()}; a newer one could not be made: {data.stale}</p>}
      {!data && !error && <p role="status">Reading this run's session files on the computer that ran it…</p>}
      {r && <ReportBody r={r} agent={agent} name={name} />}
    </section>
  );
}

function Headline({ r }: { r: TokensReport }) {
  const usd = r.cost.cli_usd;
  return <dl className="traffic-totals">
    <div><dt>Tokens</dt><dd>{tokens(r.run.tokens)}</dd></div>
    <div><dt>Agents</dt><dd>{r.run.agents}</dd></div>
    <div><dt>Model calls</dt><dd>{r.run.calls.toLocaleString()}</dd></div>
    <div><dt>Most working at once</dt><dd>{r.run.most_working}</dd></div>
    <div><dt>Typical starting context</dt><dd>{r.run.starting_context.value === null ? 'unknown' : tokens(r.run.starting_context.value)}</dd></div>
    <div><dt>Cost the CLIs reported</dt><dd>{usd.value === null ? 'not reported' : `$${usd.value.toFixed(2)}${usd.provenance === 'estimated' ? ' (some agents)' : ''}`}</dd></div>
  </dl>;
}

function ReportBody({ r, agent, name }: { r: TokensReport; agent: AgentLink; name: (id: string) => string }) {
  return <>
    <Headline r={r} />
        {r.findings.length > 0 && <section aria-label="What stands out"><h3>What stands out</h3><ul className="tokens-findings">{r.findings.map((f) => <li key={f.text}>{f.text}</li>)}</ul></section>}
        <section aria-label="Plan window"><h3>Plan window</h3><PlanWindows plan={r.plan} /></section>
        <section aria-label="Over time"><h3>Over time</h3><Timeline timeline={r.timeline} name={name} /></section>
        <section aria-label="By cause"><h3>By cause</h3><Causes parts={r.where_tokens_went} total={r.run.tokens} /></section>
        <section aria-label="By agent"><h3>By agent</h3><AgentsTable report={r} agent={agent} /></section>
        <section aria-label="Costliest"><h3>Costliest in context</h3><Costliest report={r} agent={agent} /><Sharing report={r} /></section>
        <section aria-label="Latency"><h3>Time</h3><Latency report={r} /></section>
        <p className="traffic-note">Read by MAIS from the Claude Code and Codex session files on the computer that ran the team; only this report leaves it. Measured figures are the CLIs' own; estimated ones split a call's measured context among its parts by characters; derived ones are arithmetic on measured figures. Unknown is never shown as zero.</p>
  </>;
}

import type { ReactNode } from 'react';
import { tokens } from './UsageDashboard';
import { pct, provenanceNote, seconds, type Figure, type TokensReport } from '../tokensReport';

/** An agent's name, as a link to its page when it is still on the team. */
export type AgentLink = (id: string) => ReactNode;

const fig = (f: Figure<number>, show: (n: number) => string = tokens) => f.value === null ? 'unknown' : `${show(f.value)}${provenanceNote(f.provenance) ? ` (${provenanceNote(f.provenance)})` : ''}`;

/** Tokens by agent: what each started with, how far its context grew, and what re-reading them cost. */
export function AgentsTable({ report, agent }: { report: TokensReport; agent: AgentLink }) {
  return <div className="traffic-table"><table>
    <caption>Every agent, most tokens first. Start re-read is the starting context times its calls; growth re-read is what it added, times the later calls that re-sent it.</caption>
    <thead><tr><th>Agent</th><th>Group</th><th>Calls</th><th>Tokens</th><th>Starting context</th><th>Final context</th><th>Start re-read</th><th>Growth re-read</th><th>Model time</th><th>Waiting (derived)</th></tr></thead>
    <tbody>{report.agents.map((a) => <tr key={a.id}>
      <td>{agent(a.id)}{a.parent && <span className="muted"> · started by {agent(a.parent)}</span>}</td>
      <td>{a.group ?? ''}</td><td>{a.calls}</td><td>{a.tokens.toLocaleString()}</td>
      <td>{tokens(a.starting_context)}</td><td>{tokens(a.final_context)}</td>
      <td>{tokens(a.start_reread)}</td><td>{tokens(a.growth_reread)}</td>
      <td>{seconds(a.model_ms.value)}</td><td>{seconds(a.waiting_ms.value)}</td>
    </tr>)}</tbody>
  </table></div>;
}

const clip = (t: string) => (t.length > 140 ? `${t.slice(0, 140)}…` : t);

/** The things in agents' context whose re-reads cost the most. */
export function Costliest({ report, agent }: { report: TokensReport; agent: AgentLink }) {
  const rows = report.costliest.filter((c) => (c.reread.value ?? 0) > 0).slice(0, 12);
  if (!rows.length) return null;
  return <div className="traffic-table"><table>
    <caption>What cost the most: its size, times the calls that re-sent it.</caption>
    <thead><tr><th>Agent</th><th>What</th><th>Command or file</th><th>Size</th><th>Re-read</th></tr></thead>
    <tbody>{rows.map((c, i) => <tr key={i}>
      <td>{agent(c.agent)}</td><td>{c.cause}</td><td className="tokens-target" title={c.target ?? undefined}>{c.tool ? `${c.tool}: ` : ''}{clip(c.target ?? '')}</td>
      <td>{fig(c.tokens)}</td><td>{fig(c.reread)}</td>
    </tr>)}</tbody>
  </table></div>;
}

/** Files several agents each read into their own context, the start they shared, and unused tools. */
export function Sharing({ report }: { report: TokensReport }) {
  const s = report.shared_start, unused = report.tools.filter((t) => t.calls === 0 && (t.definition_reread.value ?? 0) > 0);
  return <div className="tokens-sharing">
    {report.shared_reads.length > 0 && <section aria-label="Files many agents read"><h4>Files several agents read for themselves</h4>
      <ul>{report.shared_reads.slice(0, 8).map((r) => <li key={r.target}><code>{r.target}</code> · {r.agents} agents · re-read {fig(r.reread)}</li>)}</ul></section>}
    {(s.writes_avoidable.value ?? 0) > 0 && <section aria-label="Shared start"><h4>The same start in every agent</h4>
      <p>{fig(s.identical_per_agent)} of each agent's start was identical in {s.agents} agents, yet each wrote it to the cache: about {fig(s.writes_avoidable)} of the {tokens(s.first_call_cache_writes)} written on first calls could have been reads.</p></section>}
    {unused.length > 0 && <section aria-label="Tools never called"><h4>Tools given and never called</h4>
      <ul>{unused.slice(0, 10).map((t) => <li key={t.tool}><code>{t.tool}</code> · given to {t.agents_given} agents · its definition re-read {fig(t.definition_reread)}</li>)}</ul></section>}
  </div>;
}

/** How long model calls and tools took, and how agents' active time divided. */
export function Latency({ report }: { report: TokensReport }) {
  const l = report.latency;
  const slowest = Object.entries(l.tools).sort((a, b) => b[1].total_ms - a[1].total_ms).slice(0, 5);
  return <dl className="traffic-totals tokens-latency">
    <div><dt>Model call, median</dt><dd>{seconds(l.model.median_ms)}</dd></div>
    <div><dt>Model call, slowest 10%</dt><dd>{seconds(l.model.p90_ms)}</dd></div>
    <div><dt>Time in model calls</dt><dd>{l.model_share.value === null ? 'unknown' : pct(l.model_share.value)}</dd></div>
    <div><dt>Time in tools</dt><dd>{l.tool_share.value === null ? 'unknown' : pct(l.tool_share.value)}</dd></div>
    <div><dt>Waiting for work</dt><dd>{l.waiting_share.value === null ? 'unknown' : pct(l.waiting_share.value)}</dd></div>
    {slowest.length > 0 && <div className="tokens-wide"><dt>Tools that took longest in all</dt><dd>{slowest.map(([t, d]) => `${t} ${seconds(d.total_ms)}`).join(' · ')}</dd></div>}
  </dl>;
}

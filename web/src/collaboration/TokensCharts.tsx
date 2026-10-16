import { useState } from 'react';
import { tokens } from './UsageDashboard';
import { pct, provenanceNote, providerName, windowName, type Part, type PlanSeries, type TokensReport } from '../tokensReport';

const W = 720, PAD = { l: 56, r: 12 };
const EVENT_WORDS: Record<string, string> = { stop: 'Stopped', 'wrap-up': 'Wrapped up', pause: 'Paused', continue: 'Continued' };
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Each plan window: what was used before the run, what the run added, and the budget's wrap-up and stop. */
export function PlanWindows({ plan }: { plan: PlanSeries[] }) {
  if (!plan.length) return <p className="muted">No plan reading came in during this run (Codex reports them; Claude Code reports them to Sculptured while agents run).</p>;
  const x = (p: number) => PAD.l + (Math.min(100, Math.max(0, p)) / 100) * (W - PAD.l - PAD.r);
  return <div className="tokens-plan">{plan.map((s) => {
    const [soft, hard] = s.budget ?? [null, null];
    const name = `${providerName(s.provider)} ${windowName(s.window)} window`;
    const added = s.added.value ?? s.highest - s.first;
    const said = `${name}: ${Math.round(s.first)}% before the run, ${Math.round(s.highest)}% at its highest, ${added.toFixed(0)} points added${hard !== null ? `; the budget wraps up at ${soft} and stops at ${hard} points` : ''}.`;
    return <figure key={`${s.provider}:${s.window}`}>
      <figcaption>{said}{s.points_per_million.value !== null && ` About ${s.points_per_million.value.toFixed(1)} points per million tokens (${s.points_per_million.provenance}).`}</figcaption>
      <svg viewBox={`0 0 ${W} 44`} role="img" aria-label={said}>
        <rect className="plan-track" x={x(0)} y={12} width={x(100) - x(0)} height={12} rx={4} />
        <rect className="plan-before" x={x(0)} y={12} width={x(s.first) - x(0)} height={12} rx={4} />
        <rect className="plan-added" x={x(s.first)} y={12} width={Math.max(2, x(s.highest) - x(s.first))} height={12} />
        {soft !== null && <g><line className="plan-mark" x1={x(s.first + soft)} x2={x(s.first + soft)} y1={6} y2={30} /><text className="usage-axis" x={x(s.first + soft) - 3} y={42} textAnchor="end">wrap up {soft}</text></g>}
        {hard !== null && <g><line className="plan-mark plan-stop" x1={x(s.first + hard)} x2={x(s.first + hard)} y1={6} y2={30} /><text className="usage-axis" x={x(s.first + hard) + 3} y={42}>stop {hard}</text></g>}
        <text className="usage-axis" x={PAD.l - 6} y={22} textAnchor="end">{providerName(s.provider)}</text>
      </svg>
      {s.events.length > 0 && <ul className="tokens-events">{s.events.map((e) => <li key={e.at_ms}>{clock(e.at_ms)} · {EVENT_WORDS[e.kind]}: {e.reason}</li>)}</ul>}
    </figure>;
  })}</div>;
}

/** Tokens per interval, and agents working, on one time axis; fan-outs marked where they began. */
export function Timeline({ timeline, name }: { timeline: TokensReport['timeline']; name: (id: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = timeline.points;
  if (!pts.length) return <p className="muted">No model calls in this run yet.</p>;
  const t0 = pts[0].at_ms, t1 = Math.max(t0 + timeline.interval_ms, pts.at(-1)!.at_ms + timeline.interval_ms);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const bw = Math.max(2, x(t0 + timeline.interval_ms) - x(t0) - 2);
  const top = Math.max(1, ...pts.map((p) => p.tokens)), most = Math.max(1, ...pts.map((p) => p.agents_working));
  const yT = (v: number) => 120 - (v / top) * 108, yA = (v: number) => 210 - (v / most) * 64;
  const h = hover === null ? null : pts[hover];
  return <figure className="usage-chart">
    <figcaption>Tokens every {Math.round(timeline.interval_ms / 1000)} s, and agents making model calls in each interval</figcaption>
    <svg viewBox={`0 0 ${W} 236`} role="img" aria-label={`Tokens and agents working from ${clock(t0)} to ${clock(t1)}; at most ${tokens(top)} tokens and ${most} agents in one interval`} onPointerLeave={() => setHover(null)}>
      <text className="usage-axis" x={PAD.l - 6} y={yT(top) + 4} textAnchor="end">{tokens(top)}</text>
      <line className="usage-grid" x1={PAD.l} x2={W - PAD.r} y1={yT(0)} y2={yT(0)} />
      {pts.map((p) => <rect key={p.at_ms} className="tokens-bar" x={x(p.at_ms) + 1} y={yT(p.tokens)} width={bw} height={Math.max(0, yT(0) - yT(p.tokens))} rx={2} />)}
      <text className="usage-axis" x={PAD.l - 6} y={yA(most) + 4} textAnchor="end">{most}</text>
      <text className="usage-axis" x={PAD.l} y={yA(most) - 8}>agents working</text>
      <line className="usage-grid" x1={PAD.l} x2={W - PAD.r} y1={yA(0)} y2={yA(0)} />
      <path className="usage-line tokens-working" d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at_ms)},${yA(p.agents_working)} H${x(p.at_ms + timeline.interval_ms)}`).join(' ')} />
      {timeline.fanouts.map((f) => <g key={f.at_ms}><line className="usage-cross" x1={x(f.at_ms)} x2={x(f.at_ms)} y1={8} y2={210} strokeDasharray="4 3" /><text className="usage-axis" x={x(f.at_ms) + 4} y={16}>{f.agents} started{f.from ? ` from ${name(f.from)}` : ''}</text></g>)}
      <text className="usage-axis" x={PAD.l} y={230}>{clock(t0)}</text>
      <text className="usage-axis" x={W - PAD.r} y={230} textAnchor="end">{clock(t1)}</text>
      {pts.map((p, i) => <rect key={`hit${p.at_ms}`} className="tokens-hit" x={x(p.at_ms)} y={0} width={bw + 2} height={214} onPointerEnter={() => setHover(i)} />)}
    </svg>
    {h && <div className="usage-tip" style={{ left: `${(x(h.at_ms) / W) * 100}%` }} role="status"><strong>{clock(h.at_ms)}</strong><span>{h.tokens.toLocaleString()} tokens</span><span>{h.agents_working} agents working</span></div>}
  </figure>;
}

const GROUPS: [Part['group'], string][] = [['start', 'Starting context, re-read on every call'], ['growth', 'What the agents added as they worked, re-read on later calls'], ['output', 'Written by the agents']];

/** Every token of the run by cause, largest first within each group. */
export function Causes({ parts, total }: { parts: Part[]; total: number }) {
  const top = Math.max(1, ...parts.map((p) => p.tokens));
  return <div className="tokens-causes">{GROUPS.map(([g, title]) => {
    const rows = parts.filter((p) => p.group === g && p.tokens > 0);
    if (!rows.length) return null;
    return <section key={g} aria-label={title}><h4>{title}</h4><ul>{rows.map((p) => <li key={p.part}>
      <span className="tokens-cause-name">{p.part}</span>
      <span className="tokens-cause-bar"><i className={`tokens-${g}`} style={{ width: `${(100 * p.tokens) / top}%` }} /></span>
      <span className="tokens-cause-value">{tokens(p.tokens)} · {pct(p.tokens / Math.max(1, total))}{provenanceNote(p.provenance) && <em> · {provenanceNote(p.provenance)}</em>}</span>
    </li>)}</ul></section>;
  })}</div>;
}

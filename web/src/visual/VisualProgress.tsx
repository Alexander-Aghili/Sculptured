import {PhaseBrief,workMessage} from './PhaseBrief';
import {DismissibleError} from '../shell/DismissibleError';
import { ContextOverview } from './ContextOverview';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { EventRecord } from '../generated/EventRecord';
import { durationText, type AgentState } from '../herdr';
import { sinceText } from '../progress/activity';
import { useSeatEvents, GAP_NOTICE } from '../useSeatEvents';
import { plural, tokenSum, tokensLabel } from '../format';
import { Diff, KIND_ICON } from '../shell/ToolCard';
import { FoldToggle, isLong, useFold, type FoldLimit } from '../shell/Fold';
import { scrollWithin } from '../shell/highlight';
import { Icon, Segmented, StateMark, type IconName } from '../shell/ui';
import { deriveProcess, fileTree, type Check, type Claim, type FileEntry, type Phase, type PhaseStatus, type Step, type TreeNode, type Trigger } from './process';
import { KIND_WORD, TOOL_KINDS } from './tools';
import './visual.css';

/** Phases drawn at first; earlier ones wait behind "Show earlier". */
const PHASES = 30;
/** Nodes drawn per phase before "+N more". */
const NODES = 40;
/** File rows drawn before "Show all". */
const FILES = 200;

type Mode = 'diagram' | 'list';
type ViewState = { mode: Mode; file: string | null; all: boolean; scroll: number };

/** Per-agent view state, kept while you visit the Transcript and come back. */
const VIEWS = new Map<string, ViewState>();

const STEP_WORD: Record<Step['status'], string> = { ok: '✓ ok', error: '✗ error', running: 'running' };

const PHASE_WORD: Record<PhaseStatus, string> = {
  completed: '✓ completed',
  failed: '✗ failed',
  interrupted: '◼ interrupted',
  running: 'running',
  'cut-off': '✗ cut off: the session ended',
};

const ACTION_ICON: Record<string, IconName> = { read: 'file-text', edited: 'pencil', wrote: 'file-plus', created: 'file-plus' };

/** A one-line summary of Markdown: heading, quote and emphasis markers dropped, words kept. */
export function plainLine(s: string): string {
  return s
    .replace(/^\s{0,3}(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

function triggerText(t: Trigger): { label: string; text: string } {
  switch (t.kind) {
    case 'job':
      return { label: 'Job · sent at start', text: plainLine(workMessage(t.text).split('\n')[0]) };
    case 'handoff':
      return { label: t.firstLine || 'Handed over', text: '' };
    case 'agent':
      return {label: `Agent ${t.from.join(', ')}:`, text: plainLine(workMessage(t.text).split('\n')[0])};
    case 'system':
      return {label: 'System:', text: plainLine(workMessage(t.text).split('\n')[0])};
    default:
      return { label: 'You:', text: plainLine(workMessage(t.text).split('\n')[0]) };
  }
}

const TRIGGER_ICON: Record<Trigger['kind'], IconName> = { job: 'file-text', handoff: 'arrow-right', operator: 'message', agent: 'message', system: 'message' };

function Running() {
  return <span className="spin-ring" aria-hidden="true" />;
}

/** What the agent is doing now, or did last, with a way to that turn. */
function NowBar({ p, now, onShow }: { p: ReturnType<typeof deriveProcess>; now: number; onShow: (n: number) => void }) {
  const last = p.phases[p.phases.length - 1];
  if (!last) return null;
  const step = [...last.steps].reverse().find((s) => s.status === 'running');
  const running = last.status === 'running';
  return (
    <div className={`vp-now${running ? ' live' : ''}`}>
      <span className="vp-now-label">{running ? 'Now' : 'Last'}</span>
      <span className="vp-now-text">
        {last.turnId === null ? 'Outside a turn' : `Turn ${last.n}`} · {running && <Running />}
        {PHASE_WORD[last.status]}
        {step ? (
          <>
            {' · '}
            <Icon name={KIND_ICON[step.kind]} size={12} />{' '}
            <span data-raw-evidence>
              {step.name} {step.summary}
            </span>
          </>
        ) : running ? (
          ' · thinking'
        ) : last.endMs !== null ? (
          ` · ${sinceText(last.endMs, now)}`
        ) : null}
      </span>
      <button type="button" className="link-btn" onClick={() => onShow(last.n)}>
        Show turn
      </button>
    </div>
  );
}

function Summary({ p, state, now }: { p: ReturnType<typeof deriveProcess>; state: AgentState; now: number }) {
  const s = p.summary;
  const total = s.toolCalls || 1;
  return (
    <section className="vp-summary" aria-label="Summary">
      <div className="vp-tile">
        <span className="vp-tile-label">State</span>
        <span className="vp-tile-value">
          <StateMark state={state} />
        </span>
      </div>
      <div className="vp-tile">
        <span className="vp-tile-label">Turns</span>
        <span className="vp-tile-value">{s.turns}</span>
      </div>
      <div className="vp-tile wide">
        <span className="vp-tile-label">Tool calls</span>
        <span className="vp-tile-value">{s.toolCalls}</span>
        {s.failedSteps > 0 && <span className="vp-tile-sub tone-red"> · ✗ {s.failedSteps} failed</span>}
        {s.toolCalls > 0 && (
          <>
            <span className="vp-kindbar" aria-hidden="true">
              {TOOL_KINDS.filter((k) => s.byKind[k]).map((k) => (
                <span key={k} className={`k-${k}`} style={{ flexGrow: s.byKind[k] / total }} />
              ))}
            </span>
            <span className="vp-kindlegend">
              {TOOL_KINDS.filter((k) => s.byKind[k]).map((k) => (
                <span key={k} className={`vp-kindkey k-${k}`}>
                  <Icon name={KIND_ICON[k]} size={11} />
                  {KIND_WORD[k]} {s.byKind[k]}
                </span>
              ))}
            </span>
          </>
        )}
      </div>
      <div className="vp-tile">
        <span className="vp-tile-label">Files changed</span>
        <span className="vp-tile-value">{s.filesChanged}</span>
        <span className="vp-tile-sub"> · {s.filesRead} read</span>
      </div>
      <div className="vp-tile">
        <span className="vp-tile-label">Commands</span>
        <span className="vp-tile-value">{s.commands}</span>
      </div>
      <div className="vp-tile">
        <span className="vp-tile-label">Checks</span>
        <span className="vp-tile-value">{s.checks}</span>
        {s.checksWithError > 0 && <span className="vp-tile-sub tone-red"> · {plural(s.checksWithError, 'error result')}</span>}
      </div>
      <div className="vp-tile">
        <span className="vp-tile-label">Last activity</span>
        <span className="vp-tile-value small" title={s.lastActivityMs === null ? undefined : new Date(s.lastActivityMs).toLocaleString()}>
          {sinceText(s.lastActivityMs, now)}
        </span>
      </div>
    </section>
  );
}

/** A phase's tool calls as small nodes: one tab stop, arrow keys move between them. */
function NodeRow({ phase, onJump }: { phase: Phase; onJump: (key: string) => void }) {
  const [active, setActive] = useState(0);
  const [all, setAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const steps = all ? phase.steps : phase.steps.slice(0, NODES);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button.vp-node') ?? [])];
    const i = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(nodes.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = nodes.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    nodes[next].focus();
  };
  if (phase.steps.length === 0) return <p className="vp-nodes-empty muted">No tool calls</p>;
  return (
    <div className="vp-nodes-wrap">
      <div className="vp-nodes" role="group" aria-label={`Turn ${phase.n} tool calls`} ref={ref} onKeyDown={onKeyDown}>
        {steps.map((s, i) => {
          const label = `${s.name}: ${s.summary} — ${STEP_WORD[s.status]}`;
          return (
            <button
              key={s.key}
              type="button"
              className={`vp-node k-${s.kind} s-${s.status}${s.helper ? ' helper' : ''}`}
              tabIndex={i === Math.min(active, steps.length - 1) ? 0 : -1}
              aria-label={label}
              data-tip={label}
              data-raw-evidence-title
              onFocus={() => setActive(i)}
              onClick={() => onJump(s.key)}
            >
              <Icon name={KIND_ICON[s.kind]} size={12} />
              {s.status === 'error' && (
                <span className="vp-node-x" aria-hidden="true">
                  ✗
                </span>
              )}
            </button>
          );
        })}
      </div>
      {phase.steps.length > NODES && (
        <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `+${phase.steps.length - NODES} more`}
        </button>
      )}
    </div>
  );
}

function Counts({ phase }: { phase: Phase }) {
  const kinds = TOOL_KINDS.filter((k) => phase.counts[k]);
  if (kinds.length === 0) return null;
  return (
    <p className="vp-counts">
      {kinds.map((k, i) => (
        <span key={k} className={`k-${k}`}>
          {i > 0 && <span className="sep">·</span>}
          {KIND_WORD[k]} {phase.counts[k]}
        </span>
      ))}
      {phase.failedSteps > 0 && <span className="tone-red"> · ✗ {phase.failedSteps} failed</span>}
    </p>
  );
}

/** Seconds under a minute, then minutes, then hours and minutes. */
function span(ms: number): string {
  if (ms < 60_000) return durationText(ms);
  const m = Math.floor(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function phaseMeta(p: Phase, now: number): string {
  const dur = p.endMs !== null ? span(p.endMs - p.startMs) : p.status === 'running' ? `for ${span(Math.max(0, now - p.startMs))}` : 'duration unknown';
  return `${dur} · ${tokensLabel(tokenSum(p.tokens))}`;
}

/** Turn text past one line or this many characters starts clamped, with "Show more" on the card. */
const CARD_FOLD: FoldLimit = { chars: 160, lines: 1 };

function PhaseHead({ p, now, children }: { p: Phase; now: number; children?: ReactNode }) {
  return (
    <div className="vp-card-head">
      <span className="vp-turn">{p.turnId === null ? 'Outside a turn' : `Turn ${p.n}`}</span>{' '}
      <span className={`vp-status st-${p.status}`} title="How the turn ended. It says nothing about whether the work is right.">
        {p.status === 'running' && <Running />}
        {PHASE_WORD[p.status]}
      </span>{' '}
      <span className="vp-meta">{phaseMeta(p, now)}</span>
      {children}
    </div>
  );
}

/** What started the turn: its first line, clamped; the whole message when the card is open. */
function TriggerRow({ p, open, onJump }: { p: Phase; open: boolean; onJump: (key: string) => void }) {
  const t = p.triggers[0];
  if (!t) return <p className="vp-trigger none">Started by: unknown</p>;
  const tt = triggerText(t);
  const text = open ? t.text : tt.text;
  return (
    <button type="button" className={`vp-trigger o-${t.kind}`} onClick={() => onJump(t.key)}>
      <Icon name={TRIGGER_ICON[t.kind]} size={13} />
      <span className="vp-trigger-text">
        <span className="vp-trigger-label">{tt.label}</span>
        {p.triggers.length > 1 && <span className="muted"> +{p.triggers.length - 1} more</span>}{' '}
        {text && <span data-raw-evidence>{text}</span>}
      </span>
    </button>
  );
}

/** The turn's last reply (◇ reported): its first line, clamped; all of it when the card is open. */
function ReplyRow({ reply, open, onJump }: { reply: NonNullable<Phase['reply']>; open: boolean; onJump: (key: string) => void }) {
  return (
    <button type="button" className="vp-reply" onClick={() => onJump(reply.key)}>
      <span className="vp-reply-text">
        <span className="tier-inline tier-reported">◇ reported</span>{' '}
        <span data-raw-evidence title={open ? undefined : reply.firstLine} data-raw-evidence-title>
          {open ? reply.text : plainLine(reply.firstLine)}
        </span>
      </span>
    </button>
  );
}

const foldsInCard = (p: Phase) => isLong(p.triggers[0]?.text ?? '', CARD_FOLD) || isLong(p.reply?.text ?? '', CARD_FOLD);

function PhaseCard({ p, onJump, now, last }: { p: Phase; onJump: (key: string) => void; now: number; last: boolean }) {
  const { open, toggle } = useFold();
  return (
    <li className={`vp-phase st-${p.status}${last ? ' last' : ''}`} data-phase={p.n}>
      <div className="vp-rail" aria-hidden="true">
        <span className="vp-dot">{p.status === 'running' ? <Running /> : p.n}</span>
        <span className="vp-line" />
      </div>
      <div className="vp-card" data-open={open}>
        <PhaseHead p={p} now={now}>
          {foldsInCard(p) && <FoldToggle open={open} onToggle={toggle} className="vp-more" />}
        </PhaseHead>
        <TriggerRow p={p} open={open} onJump={onJump} />
        <PhaseBrief phase={p} onJump={onJump} />
        <NodeRow phase={p} onJump={onJump} />
        <Counts phase={p} />
        {p.reply && <ReplyRow reply={p.reply} open={open} onJump={onJump} />}
      </div>
    </li>
  );
}

function Waiting({ items, onJump }: { items: Trigger[]; onJump: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="vp-waiting">
      {items.map((w) => (
        <button key={w.key} type="button" className={`vp-wait${w.state === 'failed' ? ' failed' : ''}`} onClick={() => onJump(w.key)}>
          {w.state === 'failed' ? <span className="tone-red">✗ not sent</span> : <span className="muted">◷ waiting to be read</span>}
          <span className="vp-trigger-label">{triggerText(w).label}</span>
          {triggerText(w).text && <span data-raw-evidence>{triggerText(w).text}</span>}
          {w.reason && (
            <span className="muted">
              {' — '}
              <span data-raw-evidence>{w.reason}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ProcessList({ phases, onJump }: { phases: Phase[]; onJump: (key: string) => void }) {
  return (
    <ol className="vp-list" aria-label="Process as a list">
      {phases.map((p) => (
        <li key={p.id}>
          <div className="vp-list-head">
            {p.turnId === null ? 'Outside a turn' : `Turn ${p.n}`} — {PHASE_WORD[p.status]}
          </div>
          <ul>
            {p.triggers.map((t) => (
              <li key={t.key}>
                <button type="button" className="link-btn" onClick={() => onJump(t.key)}>
                  Start: {triggerText(t).label} <span data-raw-evidence>{triggerText(t).text}</span>
                </button>
              </li>
            ))}
            {p.steps.map((s) => (
              <li key={s.key}>
                <button type="button" className={`link-btn s-${s.status}`} onClick={() => onJump(s.key)}>
                  <span data-raw-evidence>
                    {s.name} {s.summary}
                  </span>{' '}
                  — {STEP_WORD[s.status]}
                </button>
              </li>
            ))}
            {p.reply && (
              <li>
                <button type="button" className="link-btn" onClick={() => onJump(p.reply!.key)}>
                  Reply (◇ reported): <span data-raw-evidence>{plainLine(p.reply.firstLine)}</span>
                </button>
              </li>
            )}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function fileName(path: string) {
  return path.split('/').pop() || path;
}

function TreeRows({ nodes, byPath, selected, onSelect, depth }: { nodes: TreeNode[]; byPath: Map<string, FileEntry>; selected: string | null; onSelect: (path: string) => void; depth: number }) {
  return (
    <>
      {nodes.map((n) => {
        if (!n.isFile)
          return (
            <li key={`d-${n.path}`} className="vp-dir">
              <span className="vp-dir-name" style={{ paddingLeft: depth * 14 }} data-raw-evidence>
                <Icon name="folder" size={13} className="muted" />
                {n.name}/
              </span>
              <ul>
                <TreeRows nodes={n.children} byPath={byPath} selected={selected} onSelect={onSelect} depth={depth + 1} />
              </ul>
            </li>
          );
        const f = byPath.get(n.path)!;
        const changed = f.changes.length > 0;
        return (
          <li key={n.path}>
            <button
              type="button"
              className={`vp-file a-${f.last.action}${changed ? ' changed' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              aria-pressed={selected === n.path}
              onClick={() => onSelect(n.path)}
            >
              <Icon name={ACTION_ICON[f.last.action]} size={13} />
              <span className="vp-file-name" data-raw-evidence>
                {n.name}
              </span>
              <span className="vp-file-badges">
                {changed && <span className="vp-badge change">{plural(f.changes.length, 'change')}</span>}
                {f.reads > 0 && <span className="vp-badge read">read ×{f.reads}</span>}
              </span>
              <span className="vp-file-last">
                {f.last.action} · turn {f.last.phase}
              </span>
            </button>
          </li>
        );
      })}
    </>
  );
}

function FileDetail({ f, onJump, onClose }: { f: FileEntry; onJump: (key: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  // Bring the changes into view when a file is picked, inside this tab's own scroller only.
  useEffect(() => {
    const el = ref.current;
    const box = el?.closest<HTMLElement>('.vp');
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top > b.bottom - 80 || r.top < b.top) scrollWithin(box, el, 'start');
  }, []);
  return (
    <section ref={ref} className="vp-file-detail" aria-label={`Changes to ${fileName(f.path)}`}>
      <div className="vp-file-detail-head">
        <code data-raw-evidence>{f.path}</code>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close file" data-tip="Close file">
          <Icon name="x" size={13} />
        </button>
      </div>
      {f.changes.length === 0 && <p className="muted">Read only: no changes seen.</p>}
      {f.changes.map((c, i) => (
        <div key={c.key} className="vp-change">
          <div className="vp-change-head">
            <span>
              Turn {c.phase} · {c.action}
            </span>
            <span className={`tstat t-${c.status}`}>{STEP_WORD[c.status]}</span>
            <span className="pane-spacer" />
            <button type="button" className="link-btn" onClick={() => onJump(c.key)}>
              Show in transcript
            </button>
          </div>
          <div className="tc-body" data-raw-evidence>
            {c.hunks.length === 0 ? <p className="muted">No change text in the call.</p> : c.hunks.map((h, j) => <Diff key={`${i}-${j}`} old={h.old} next={h.new} />)}
          </div>
        </div>
      ))}
      {f.reads > 0 && (
        <p className="vp-file-reads muted">
          Read {plural(f.reads, 'time')}.
          {f.last.action === 'read' && (
            <>
              {' '}
              <button type="button" className="link-btn" onClick={() => onJump(f.last.key)}>
                Show last read
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}

function Files({ files, selected, onSelect, onJump }: { files: FileEntry[]; selected: string | null; onSelect: (p: string | null) => void; onJump: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, FILES);
  const tree = useMemo(() => fileTree(shown.map((f) => f.path)), [shown]);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const changed = files.filter((f) => f.changes.length > 0).length;
  const sel = selected ? byPath.get(selected) : undefined;
  return (
    <section className="vp-panel vp-files" aria-label="Built and changed">
      <div className="vp-panel-head">
        <h3>Built and changed</h3>
        <span className="vp-panel-count">
          {changed} changed · {files.length - changed} read only
        </span>
      </div>
      <p className="vp-note">
        <span className="tier-inline tier-observed">◆ observed</span> from the agent’s read, edit and write tool calls. Files changed by shell commands are not listed.
      </p>
      {files.length === 0 ? (
        <p className="muted vp-empty">No files read or changed yet.</p>
      ) : (
        <>
          {tree.root && (
            <p className="vp-root muted" data-raw-evidence>
              in {tree.root}/
            </p>
          )}
          <ul className="vp-tree">
            <TreeRows nodes={tree.nodes} byPath={byPath} selected={selected} onSelect={(p) => onSelect(p === selected ? null : p)} depth={0} />
          </ul>
          {files.length > FILES && (
            <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${files.length} files`}
            </button>
          )}
          {sel && <FileDetail key={sel.path} f={sel} onJump={onJump} onClose={() => onSelect(null)} />}
        </>
      )}
    </section>
  );
}

function outcomeText(c: Check): string {
  const o = c.outcome;
  if (o.status === 'running') return 'running';
  const exit = o.exit !== null ? ` · exit ${o.exit}` : '';
  return o.status === 'error' ? `✗ error result${exit}` : `✓ no error result${exit}`;
}

function Checks({ checks, claims, onJump }: { checks: Check[]; claims: Claim[]; onJump: (key: string) => void }) {
  return (
    <section className="vp-panel vp-checks" aria-label="Checks">
      <div className="vp-panel-head">
        <h3>Checks</h3>
        <span className="vp-panel-count">{plural(checks.length, 'command')}</span>
      </div>
      <p className="vp-note">
        Commands whose words look like tests, builds, type checks or linters (<span className="tier-inline tier-heuristic">≈ heuristic</span>). Each result is{' '}
        <span className="tier-inline tier-observed">◆ observed</span> from the captured output, and claims nothing more.
      </p>
      {checks.length === 0 ? (
        <p className="muted vp-empty">No test, build or lint commands seen.</p>
      ) : (
        <ul className="vp-check-list">
          {checks.map((c) => (
            <li key={c.key}>
              <button type="button" className={`vp-check o-${c.outcome.status}`} onClick={() => onJump(c.key)}>
                <span className="vp-check-top">
                  <Icon name="flask" size={13} />
                  <code data-raw-evidence>{c.command}</code>
                  <span className="vp-badge" title="Kind guessed from the command's words">
                    ≈ {c.kind}
                  </span>
                </span>
                <span className="vp-check-bottom">
                  <span className="tier-inline tier-observed">◆ observed</span>
                  <span className={`vp-outcome o-${c.outcome.status}`}>
                    {c.outcome.status === 'running' && <Running />}
                    {outcomeText(c)}
                  </span>
                  {c.outcome.mentionsFailure && <span className="tone-amber">· output mentions failures</span>}
                  <span className="muted">· turn {c.phase}</span>
                </span>
                {c.outcome.line && (
                  <span className="vp-check-line" data-raw-evidence>
                    {c.outcome.line}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {claims.length > 0 && (
        <div className="vp-claims">
          <h4>What the agent said</h4>
          {checks.length === 0 && <p className="tone-amber vp-claim-warn">The agent reported success, but no check command was seen.</p>}
          <ul>
            {claims.map((c) => (
              <li key={c.key}>
                <button type="button" className="vp-claim" onClick={() => onJump(c.key)}>
                  <span className="tier-inline tier-reported">◇ reported</span>
                  <span data-raw-evidence>“{plainLine(c.text)}”</span>
                  <span className="muted">· turn {c.phase}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type Props = {
  seatId: string;
  feed: EventRecord[];
  epoch: number;
  /** The agent's current state, from its projected status (◆ observed). */
  state: AgentState;
  /** Show this transcript item in the Transcript tab. */
  onJump: (key: string) => void;
};

/**
 * The agent's process as a picture: one phase per turn (what started it, its tool calls as
 * nodes, its reply), the files it read and changed, and the checks it ran. Built from the same
 * events as the Transcript; every node opens the matching point there.
 */
export function VisualProgress({ seatId, feed, epoch, state, onJump }: Props) {
  const { events, loading, error, truncated, gap } = useSeatEvents(seatId, feed, epoch);
  const p = useMemo(() => deriveProcess(events), [events]);
  const saved = VIEWS.get(seatId) ?? { mode: 'diagram', file: null, all: false, scroll: 0 };
  const [view, setView] = useState<ViewState>(saved);
  const [now, setNow] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const update = (patch: Partial<ViewState>) =>
    setView((v) => {
      const next = { ...v, ...patch };
      VIEWS.set(seatId, next);
      return next;
    });

  // Come back to where you were once the events are in.
  useLayoutEffect(() => {
    if (restored.current || loading || !scroller.current) return;
    restored.current = true;
    scroller.current.scrollTop = view.scroll;
  }, [loading, view.scroll]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !restored.current) return;
    VIEWS.set(seatId, { ...(VIEWS.get(seatId) ?? view), scroll: el.scrollTop });
  };

  const hidden = view.all ? 0 : Math.max(0, p.phases.length - PHASES);
  const phases = p.phases.slice(hidden);
  let body: ReactNode;
  if (p.phases.length === 0) body = <p className="muted vp-empty">{loading ? 'Loading…' : 'No turns yet. The process appears here as the agent works.'}</p>;
  else if (view.mode === 'list') body = <ProcessList phases={phases} onJump={onJump} />;
  else
    body = (
      <ol className="vp-phases">
        {phases.map((ph, i) => (
          <PhaseCard key={ph.id} p={ph} onJump={onJump} now={now} last={i === phases.length - 1} />
        ))}
      </ol>
    );

  return (
    <div className="vp" ref={scroller} onScroll={onScroll} data-testid="visual-progress">
      {error && (
        <DismissibleError className="tone-red pad">
          Could not load history: {error}
        </DismissibleError>
      )}
      {truncated && <p className="notice-line">Older events not loaded: the picture starts partway through.</p>}
      {gap && <p className="notice-line tone-amber">{GAP_NOTICE}</p>}
      <Summary p={p} state={state} now={now} />
      <ContextOverview seatId={seatId} events={events} partial={truncated || gap || !!error} loading={loading} onJump={onJump} />
      <NowBar
        p={p}
        now={now}
        onShow={(n) => {
          const el = scroller.current?.querySelector<HTMLElement>(`[data-phase="${n}"]`);
          scrollWithin(scroller.current, el ?? null, 'start');
          el?.querySelector<HTMLElement>('.vp-trigger, .vp-node')?.focus({ preventScroll: true });
        }}
      />
      <div className="vp-grid">
        <section className="vp-panel vp-process" aria-label="Process">
          <div className="vp-panel-head">
            <h3>Process</h3>
            <span className="vp-panel-count">{plural(p.summary.turns, 'turn')}</span>
            <span className="pane-spacer" />
            <Segmented<Mode>
              label="Process view"
              value={view.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'diagram', label: 'Diagram', icon: 'route' },
                { value: 'list', label: 'List', icon: 'list' },
              ]}
            />
          </div>
          <p className="vp-note">
            Captured work, reported progress and next actions, turn by turn. Inspect a summary for tools and the agent’s stated explanations. Tool calls (<span className="tier-inline tier-observed">◆ observed</span>) and its last reply (
            <span className="tier-inline tier-reported">◇ reported</span>). Select any part to see it in the transcript.
          </p>
          {hidden > 0 && (
            <button type="button" className="show-earlier" onClick={() => update({ all: true })}>
              Show {hidden} earlier turns
            </button>
          )}
          {body}
          <Waiting items={p.waiting} onJump={onJump} />
        </section>
        <div className="vp-side">
          <Files files={p.files} selected={view.file} onSelect={(file) => update({ file })} onJump={onJump} />
          <Checks checks={p.checks} claims={p.claims} onJump={onJump} />
        </div>
      </div>
    </div>
  );
}

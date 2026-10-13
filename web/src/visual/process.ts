import { splitTeamMessage } from '../teamMessage';
/**
 * A visual construction of an agent's process, derived from its recorded events only. Pure:
 * the same events always give the same process. Nothing is guessed:
 *
 * - phases, steps, files and checks come from protocol events and captured tool calls
 *   (◆ observed);
 * - a check's outcome repeats what its captured result says, never more;
 * - the agent's replies, and the claims in them, stay ◇ reported.
 *
 * Every element carries the key of the transcript item it came from, so the view can jump to
 * that point in the Transcript.
 */
import { originOf, parseHandoff, STOPPED_BEFORE_READING, type MessageOrigin } from '../conversation';
import type { EventRecord } from '../generated/EventRecord';
import type { MessageState } from '../generated/MessageState';
import type { TurnStatus } from '../generated/TurnStatus';
import { checkOf, checkOutcome, editOf, TOOL_KINDS, toolKind, toolPath, toolSummary, type CheckKind, type CheckOutcome, type EditAction, type Hunk, type ToolKind } from './tools';

export type StepStatus = 'running' | 'ok' | 'error';

export type Step = {
  key: string;
  callId: string;
  name: string;
  kind: ToolKind;
  summary: string;
  status: StepStatus;
  /** Call to result; null while running. */
  ms: number | null;
  /** Called by a helper agent inside this turn. */
  helper: boolean;
  input: unknown;
  output?: string;
  isError?: boolean;
};

export type Trigger = {
  kind: MessageOrigin;
  key: string;
  firstLine: string;
  /** The whole message, verbatim. */
  text: string;
  /** Upstream agents, for a handoff. */
  from: string[];
  state: MessageState;
  reason?: string;
};

/** `cut-off`: the session ended before the turn did. */
export type PhaseStatus = TurnStatus | 'running' | 'cut-off';

export type Phase = {
  id: string;
  n: number;
  turnId: string | null;
  triggers: Trigger[];
  /** Latest captured job or operator request, preserved through reply turns. */
  goal?: Trigger;
  steps: Step[];
  counts: Partial<Record<ToolKind, number>>;
  failedSteps: number;
  /** The turn's last reply, ◇ reported. */
  reply: { key: string; firstLine: string; text: string; provenance: string } | null;
  /** Public agent messages retained for inspectable explanations. */
  explanations?: {key:string;text:string;provenance:string}[];
  status: PhaseStatus;
  startMs: number;
  endMs: number | null;
  tokens: { input: number; output: number } | null;
  /** The transcript item where this phase begins. */
  anchorKey: string | null;
  endKey: string | null;
};

export type FileChange = { key: string; phase: number; action: EditAction; hunks: Hunk[]; status: StepStatus };
export type FileEntry = {
  path: string;
  reads: number;
  changes: FileChange[];
  last: { action: 'read' | EditAction; phase: number; key: string };
};
export type Check = { key: string; phase: number; command: string; kind: CheckKind; outcome: CheckOutcome; helper: boolean };
/** A sentence in a reply that says the work is done or passing: the agent's word only. */
export type Claim = { key: string; phase: number; text: string };

export type ProcessSummary = {
  turns: number;
  toolCalls: number;
  byKind: Record<ToolKind, number>;
  filesChanged: number;
  filesRead: number;
  commands: number;
  checks: number;
  checksWithError: number;
  failedSteps: number;
  lastActivityMs: number | null;
  sessions: number;
};

export type Process = {
  phases: Phase[];
  files: FileEntry[];
  checks: Check[];
  claims: Claim[];
  /** Messages not read by any turn: still waiting, or never sent. */
  waiting: Trigger[];
  summary: ProcessSummary;
};

const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? '';

const CLAIM =
  /\b(?:all\s+)?(?:tests?|checks?|builds?|specs?|suite)\b[^.\n]{0,40}?\b(?:pass(?:es|ed|ing)?|succeed(?:s|ed)?|green|work(?:s|ing)?)\b|\b(?:done|completed?|finished|fixed|implemented|working now)\b/i;

/** The first sentence of a reply that claims success, verbatim. */
export function claimIn(text: string): string | null {
  for (const s of text.split(/(?<=[.!?])\s+|\n+/)) {
    const t = s.trim();
    if (t && CLAIM.test(t)) return t.length > 200 ? `${t.slice(0, 200)}…` : t;
  }
  return null;
}

export function deriveProcess(events: EventRecord[]): Process {
  const phases: Phase[] = [];
  const byTurn = new Map<string, Phase>();
  const steps = new Map<string, Step>();
  const calledAt = new Map<string, number>();
  const messages = new Map<string, Trigger>();
  const consumed = new Set<string>();
  const replies = new Map<Phase, { key: string; text: string }>();
  let current: Phase | null = null;
  let sessions = 0;
  let lastActivityMs: number | null = null;

  const open = (turnId: string | null, e: EventRecord): Phase => {
    const p: Phase = {
      id: turnId ?? `p-${e.seq}`,
      n: phases.length + 1,
      turnId,
      triggers: [],
      steps: [],
      counts: {},
      failedSteps: 0,
      reply: null,
      explanations: [],
      status: 'running',
      startMs: e.at_ms,
      endMs: null,
      tokens: null,
      anchorKey: null,
      endKey: null,
    };
    phases.push(p);
    if (turnId) byTurn.set(turnId, p);
    current = p;
    return p;
  };
  const phaseFor = (turnId: string | null, e: EventRecord): Phase => {
    if (turnId) return byTurn.get(turnId) ?? open(turnId, e);
    return current ?? open(null, e);
  };
  const anchor = (p: Phase, key: string) => {
    if (p.anchorKey === null) p.anchorKey = key;
  };

  for (const e of events) {
    lastActivityMs = lastActivityMs === null ? e.at_ms : Math.max(lastActivityMs, e.at_ms);
    const b = e.body;
    switch (b.type) {
      case 'tenure-started':
        sessions++;
        break;
      case 'turn-started':
        if (!byTurn.has(b.turn_id)) open(b.turn_id, e);
        break;
      case 'message-queued': {
        const kind = originOf(e);
        messages.set(b.message_id, {
          kind,
          key: `m-${b.message_id}`,
          firstLine: firstLine(splitTeamMessage(b.text).text),
          text: b.text,
          from: kind === 'handoff' ? (parseHandoff(b.text)?.from ?? []) : e.actor.kind === 'seat' ? [e.actor.id] : [],
          state: 'queued',
        });
        break;
      }
      case 'message-delivered': {
        const m = messages.get(b.message_id);
        if (m && m.state === 'queued') m.state = 'delivered';
        break;
      }
      case 'message-failed': {
        const m = messages.get(b.message_id);
        if (m && m.state !== 'consumed') {
          m.state = 'failed';
          m.reason = b.reason;
        }
        break;
      }
      case 'message-consumed': {
        const m = messages.get(b.message_id);
        const p = phaseFor(b.turn_id, e);
        if (m && m.state !== 'failed') {
          m.state = 'consumed';
          consumed.add(b.message_id);
          p.triggers.push(m);
          // The message that started the turn comes before the turn's own events.
          p.anchorKey = p.triggers[0].key;
        }
        break;
      }
      case 'tool-called': {
        const p = phaseFor(b.turn_id, e);
        const s: Step = {
          key: `t-${b.call_id}-${e.seq}`,
          callId: b.call_id,
          name: b.name,
          kind: toolKind(b.name),
          summary: toolSummary(b.name, b.input),
          status: 'running',
          ms: null,
          helper: b.parent_call_id !== null,
          input: b.input,
        };
        calledAt.set(b.call_id, e.at_ms);
        steps.set(b.call_id, s);
        p.steps.push(s);
        p.counts[s.kind] = (p.counts[s.kind] ?? 0) + 1;
        anchor(p, s.key);
        break;
      }
      case 'tool-resulted': {
        const s = steps.get(b.call_id);
        if (!s) break;
        s.status = b.is_error ? 'error' : 'ok';
        s.output = b.output;
        s.isError = b.is_error;
        s.ms = Math.max(0, e.at_ms - (calledAt.get(b.call_id) ?? e.at_ms));
        break;
      }
      case 'agent-text': {
        const p = phaseFor(b.turn_id, e);
        const key = `a-${e.seq}`;
        if (b.text.trim()) {
          p.reply = { key, firstLine: firstLine(b.text), text: b.text, provenance: e.provenance };
          p.explanations!.push({key,text:b.text,provenance:e.provenance});
          replies.set(p, { key, text: b.text });
        }
        anchor(p, key);
        break;
      }
      case 'usage-reported': {
        const p = b.turn_id ? byTurn.get(b.turn_id) : current;
        if (!p) break;
        const t = p.tokens ?? { input: 0, output: 0 };
        t.input += b.input_tokens + b.cache_read_tokens + b.cache_write_tokens;
        t.output += b.output_tokens;
        p.tokens = t;
        break;
      }
      case 'turn-ended': {
        const p = phaseFor(b.turn_id, e);
        p.status = b.status;
        p.endMs = e.at_ms;
        p.endKey = `e-${e.seq}`;
        anchor(p, p.endKey);
        if (current === p) current = null;
        break;
      }
      case 'tenure-ended': {
        if (current) {
          (current as Phase).status = 'cut-off';
          (current as Phase).endMs = e.at_ms;
        }
        current = null;
        for (const m of messages.values()) {
          if (m.state === 'queued' || m.state === 'delivered') {
            m.state = 'failed';
            m.reason = STOPPED_BEFORE_READING;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  let goal:Trigger|undefined;
  for(const p of phases){goal=p.triggers.find(t=>t.kind==='job'||t.kind==='operator')??goal;p.goal=goal;}
  for (const p of phases) p.failedSteps = p.steps.filter((s) => s.status === 'error').length;

  // Files, in the order they were first touched.
  const files = new Map<string, FileEntry>();
  const checks: Check[] = [];
  for (const p of phases) {
    for (const s of p.steps) {
      if (s.kind === 'read') {
        const path = toolPath(s.input);
        if (!path) continue;
        const f = files.get(path) ?? { path, reads: 0, changes: [], last: { action: 'read', phase: p.n, key: s.key } };
        f.reads++;
        f.last = { action: 'read', phase: p.n, key: s.key };
        files.set(path, f);
      } else if (s.kind === 'edit') {
        const edit = editOf(s.name, s.input, s.output);
        if (!edit) continue;
        const f = files.get(edit.path) ?? { path: edit.path, reads: 0, changes: [], last: { action: edit.action, phase: p.n, key: s.key } };
        f.changes.push({ key: s.key, phase: p.n, action: edit.action, hunks: edit.hunks, status: s.status });
        f.last = { action: edit.action, phase: p.n, key: s.key };
        files.set(edit.path, f);
      } else if (s.kind === 'bash') {
        const kind = checkOf(s.summary.replace(/ …$/, ''));
        if (kind) checks.push({ key: s.key, phase: p.n, command: s.summary, kind, outcome: checkOutcome(s.output, s.isError), helper: s.helper });
      }
    }
  }

  const claims: Claim[] = [];
  for (const p of phases) {
    const r = replies.get(p);
    const text = r && claimIn(r.text);
    if (r && text) claims.push({ key: r.key, phase: p.n, text });
  }

  const byKind = Object.fromEntries(TOOL_KINDS.map((k) => [k, 0])) as Record<ToolKind, number>;
  let failedSteps = 0;
  for (const p of phases)
    for (const s of p.steps) {
      byKind[s.kind]++;
      if (s.status === 'error') failedSteps++;
    }
  const fileList = [...files.values()];

  return {
    phases,
    files: fileList,
    checks,
    claims,
    waiting: [...messages.entries()].filter(([id]) => !consumed.has(id)).map(([, m]) => m),
    summary: {
      turns: phases.filter((p) => p.turnId !== null).length,
      toolCalls: phases.reduce((n, p) => n + p.steps.length, 0),
      byKind,
      filesChanged: fileList.filter((f) => f.changes.length > 0).length,
      filesRead: fileList.filter((f) => f.reads > 0).length,
      commands: byKind.bash,
      checks: checks.length,
      checksWithError: checks.filter((c) => c.outcome.status === 'error').length,
      failedSteps,
      lastActivityMs,
      sessions,
    },
  };
}

export type TreeNode = { name: string; path: string; children: TreeNode[]; isFile: boolean };

/**
 * Paths as a folder tree under their common folder (`root`). Folders come before files, each
 * sorted by name; a folder with a single sub-folder and no files is folded into one row.
 */
export function fileTree(paths: string[]): { root: string; nodes: TreeNode[] } {
  if (paths.length === 0) return { root: '', nodes: [] };
  const split = paths.map((p) => p.split('/'));
  let common = split[0].slice(0, -1);
  for (const s of split.slice(1)) {
    let i = 0;
    while (i < common.length && i < s.length - 1 && common[i] === s[i]) i++;
    common = common.slice(0, i);
  }
  const root = common.join('/');
  const top: TreeNode = { name: '', path: root, children: [], isFile: false };
  for (const [idx, parts] of split.entries()) {
    let node = top;
    const rest = parts.slice(common.length);
    rest.forEach((name, i) => {
      const isFile = i === rest.length - 1;
      let child = node.children.find((c) => c.name === name && c.isFile === isFile);
      if (!child) {
        child = { name, path: isFile ? paths[idx] : [...common, ...rest.slice(0, i + 1)].join('/'), children: [], isFile };
        node.children.push(child);
      }
      node = child;
    });
  }
  const tidy = (n: TreeNode): TreeNode => {
    let cur = n;
    while (!cur.isFile && cur.children.length === 1 && !cur.children[0].isFile && cur.name) {
      const only = cur.children[0];
      cur = { ...only, name: `${cur.name}/${only.name}` };
    }
    cur.children = cur.children.map(tidy).sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name));
    return cur;
  };
  return { root, nodes: tidy(top).children };
}

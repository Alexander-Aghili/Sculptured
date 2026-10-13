import type { EventRecord } from '../generated/EventRecord';
import { splitTeamMessage } from '../teamMessage';
import { originOf } from '../conversation';

export const CONTEXT_KINDS = ['instructions', 'messages', 'workflow', 'tool-inputs', 'tool-results', 'replies'] as const;
export type ContextKind = typeof CONTEXT_KINDS[number];
export const CONTEXT_LABEL: Record<ContextKind, string> = {
  instructions: 'Team & job instructions', messages: 'Your messages', workflow: 'Assignments & handoffs',
  'tool-inputs': 'Tool inputs', 'tool-results': 'Tool results', replies: 'Agent replies',
};
export type ContextEntry = { id: string; key: string | null; kind: ContextKind; text: string; chars: number; at: number; seq: number; label: string; provenance: string };
export type ContextReport = EventRecord & { body: Extract<EventRecord['body'], { type: 'context-reported' }> };
export function contextEvents(events: EventRecord[]) {
  const ordered = [...new Map(events.map(e => [e.seq, e])).values()].sort((a, b) => a.seq - b.seq);
  let boundary = -1; for (let i=ordered.length-1;i>=0;i--) if(ordered[i].body.type==='tenure-started') { boundary=i; break; }
  return { events: ordered.slice(Math.max(0, boundary)), boundaryKnown: boundary >= 0 };
}
export function contextReports(events: EventRecord[]): ContextReport[] {
  return events.filter((e): e is ContextReport => e.body.type === 'context-reported');
}

/** Captured content only. Never claims this is the CLI's exact retained prompt after compaction. */
export function deriveContext(events: EventRecord[]) {
  const entries: ContextEntry[] = [], calls = new Map<string, {key: string; name: string; parent: boolean}>();
  const readMessages = new Set(events.flatMap(e => e.body.type === 'message-consumed' ? [e.body.message_id] : []));
  const paths = new Set<string>(), urls = new Set<string>();
  let pending = 0, hiddenThinking = 0;
  const add = (e: EventRecord, kind: ContextKind, text: string, key: string | null, label: string, suffix = '') => {
    if (!text) return;
    let chars = 0; for (const _ of text) chars++;
    for (const m of text.matchAll(/https?:\/\/[^\s<>"'\]\)]+/g)) urls.add(m[0]);
    entries.push({ id: `${e.seq}:${kind}:${suffix}`, kind, text, chars, key, seq: e.seq, at: e.at_ms, label, provenance: e.provenance });
  };
  for (const e of events) {
    const b = e.body;
    if (b.type === 'message-queued') {
      if (!readMessages.has(b.message_id)) { pending++; continue; }
      const key = `m-${b.message_id}`, parts = splitTeamMessage(b.text), origin = originOf(e);
      if (parts.briefing) add(e, 'instructions', parts.briefing, key, 'Captured team briefing', 'briefing');
      const workflow = origin === 'handoff' || (e.actor.kind === 'system' && e.actor.id === 'workflow');
      add(e, workflow ? 'workflow' : origin === 'job' ? 'instructions' : 'messages', parts.text, key, workflow ? 'Delivered assignment / handoff' : origin === 'job' ? 'Delivered job' : 'Delivered message');
    } else if (b.type === 'tool-called') {
      const key = `t-${b.call_id}-${e.seq}`;
      calls.set(b.call_id, {key, name:b.name, parent:!!b.parent_call_id});
      // Nested helper internals aren't necessarily in the parent model's prompt.
      if (b.parent_call_id) continue;
      for (const path of capturedPaths(b.input)) paths.add(path);
      add(e, 'tool-inputs', typeof b.input === 'string' ? b.input : JSON.stringify(b.input), key, b.name);
    } else if (b.type === 'tool-resulted') {
      const call = calls.get(b.call_id); if (call?.parent) continue;
      add(e, 'tool-results', b.output, call?.key ?? null, call ? `${call.name} result` : 'Result · call outside loaded history');
    } else if (b.type === 'agent-text') add(e, 'replies', b.text, `a-${e.seq}`, 'Captured reply');
    else if (b.type === 'thinking-recorded') hiddenThinking++;
  }
  const categories = CONTEXT_KINDS.map(kind => {
    const items = entries.filter(e => e.kind === kind), chars = items.reduce((sum, e) => sum + e.chars, 0);
    return { kind, count: items.length, chars, estimatedTokens: Math.ceil(chars / 4) };
  });
  const reports = contextReports(events);
  return { entries, categories, chars: categories.reduce((s,c)=>s+c.chars,0), paths:[...paths], urls:[...urls], pending, hiddenThinking,
    report: reports.at(-1), firstAt:events[0]?.at_ms, lastAt:events.at(-1)?.at_ms, gap:events.some(e=>e.body.type==='events-lost') };
}

/** Explicit structured path fields only; shell commands and prose are not guessed. */
function capturedPaths(input: unknown): string[] {
  const paths: string[] = [], pending: {value:unknown;depth:number}[] = [{value:input,depth:0}];
  let visited=0;
  while(pending.length && visited++<2000) {
    const {value,depth}=pending.pop()!; if(!value || typeof value!=='object' || depth>8)continue;
    for(const [key,v] of Object.entries(value)) {
      if(['path','file_path','notebook_path','filename','local_path'].includes(key) && typeof v==='string' && v.trim() && !/^https?:/.test(v)) paths.push(v);
      else if(v && typeof v==='object') pending.push({value:v,depth:depth+1});
    }
  }
  return paths;
}

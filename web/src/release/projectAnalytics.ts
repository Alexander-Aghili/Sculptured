import type { EventRecord } from "../generated/EventRecord";
import { deriveContext, CONTEXT_KINDS } from "../visual/context";
export function projectContext(events: EventRecord[]) {
  const byAgent = new Map<string, EventRecord[]>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.subject.kind !== "seat") continue;
    const rows = byAgent.get(e.subject.id) ?? [];
    rows.push(e);
    byAgent.set(e.subject.id, rows);
  }
  const agents = [...byAgent].map(([id, rows]) => ({
    id,
    ...deriveContext(rows),
  }));
  const categories = CONTEXT_KINDS.map((kind) => {
    const entries = agents.flatMap((a) =>
      a.entries.filter((e) => e.kind === kind),
    );
    const chars = entries.reduce((n, e) => n + e.chars, 0);
    return {
      kind,
      count: entries.length,
      chars,
      estimatedTokens: Math.ceil(chars / 4),
    };
  });
  return {
    agents,
    categories,
    entries: agents.flatMap((a) => a.entries),
    chars: categories.reduce((n, c) => n + c.chars, 0),
    pending: agents.reduce((n, a) => n + a.pending, 0),
    hiddenThinking: agents.reduce((n, a) => n + a.hiddenThinking, 0),
    paths: [...new Set(agents.flatMap((a) => a.paths))],
    urls: [...new Set(agents.flatMap((a) => a.urls))],
  };
}
export function turnTimings(events: EventRecord[]) {
  const starts = new Map<string, number>(),
    durations: number[] = [];
  let unmatched = 0;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.subject.kind !== "seat") continue;
    const b = e.body;
    if (b.type !== "turn-started" && b.type !== "turn-ended") continue;
    const key = `${e.subject.id}:${b.turn_id}`;
    if (b.type === "turn-started") starts.set(key, e.at_ms);
    else {
      const start = starts.get(key);
      if (start === undefined || e.at_ms < start) unmatched++;
      else {
        durations.push(e.at_ms - start);
        starts.delete(key);
      }
    }
  }
  return { durations, unmatched, open: starts.size };
}

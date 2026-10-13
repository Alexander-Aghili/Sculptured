/**
 * "Done" is per browser: a turn ended since you last viewed the agent. The last turn end
 * you have seen is kept in localStorage by agent id. Storage can be missing or throw
 * (private windows, blocked site data); then it lasts for this page only.
 */
const KEY = 'sculptured.seen.v1';

let memory: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (memory) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    memory = parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    memory = {};
  }
  return memory;
}

export function seenTurnEnd(agentId: string): number {
  return load()[agentId] ?? 0;
}

/** Records the latest turn end the user has seen for an agent. Returns true if it changed. */
export function markSeen(agentId: string, turnEndSeq: number | null): boolean {
  if (turnEndSeq === null) return false;
  const all = load();
  if ((all[agentId] ?? 0) >= turnEndSeq) return false;
  all[agentId] = turnEndSeq;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Kept in memory only.
  }
  return true;
}

export function isDone(agentId: string, lastTurnEndSeq: number | null): boolean {
  return lastTurnEndSeq !== null && lastTurnEndSeq > seenTurnEnd(agentId);
}

/** Tests only: forget the in-memory copy so the next read goes to storage. */
export function resetSeenCache(): void {
  memory = null;
}

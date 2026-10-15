/** The parts of a `mais.report/v1` report the board shows (the full schema: MAIS `schema/mais.report.v1.json`). */
export type Provenance = 'measured' | 'derived' | 'estimated' | 'unknown';
export type Figure<T> = { value: T | null; provenance: Provenance };
export type Usage = { input: number; cache_read: number; cache_write: number; output: number };

export type ReportAgent = {
  id: string; name: string; group: string | null; parent: string | null; model: string | null;
  calls: number; tokens: number; usage: Usage; starting_context: number; final_context: number;
  start_reread: number; growth_reread: number;
  model_ms: Figure<number>; tool_ms: Figure<number>; waiting_ms: Figure<number>;
};
export type Part = { group: 'start' | 'growth' | 'output'; part: string; tokens: number; provenance: Provenance };
export type CostlyItem = { agent: string; cause: string; tool: string | null; target: string | null; tokens: Figure<number>; reread: Figure<number> };
export type SharedRead = { target: string; agents: number; reread: Figure<number> };
export type ToolUse = { tool: string; agents_given: number; definition_tokens: Figure<number>; definition_reread: Figure<number>; calls: number };
export type TimePoint = { at_ms: number; tokens: number; agents_working: number };
export type Fanout = { at_ms: number; agents: number; from: string | null };
export type Durations = { count: number; total_ms: number; median_ms: number | null; p90_ms: number | null };
export type BudgetEvent = { kind: 'wrap-up' | 'stop'; at_ms: number; reason: string };
export type PlanSeries = {
  provider: string; window: string; points: [number, number, number][]; first: number; highest: number;
  added: Figure<number>; points_per_million: Figure<number>; budget: [number, number] | null; events: BudgetEvent[];
};

export type TokensReport = {
  format: string;
  run: { name: string | null; started_ms: number | null; ended_ms: number | null; agents: number; calls: number; usage: Usage; tokens: number; most_working: number; models: string[]; starting_context: Figure<number> };
  agents: ReportAgent[];
  where_tokens_went: Part[];
  costliest: CostlyItem[];
  shared_reads: SharedRead[];
  shared_start: { agents: number; identical_per_agent: Figure<number>; first_call_cache_writes: number; writes_avoidable: Figure<number> };
  tools: ToolUse[];
  timeline: { interval_ms: number; points: TimePoint[]; fanouts: Fanout[] };
  latency: { model: Durations; tool_share: Figure<number>; model_share: Figure<number>; waiting_share: Figure<number>; tools: Record<string, Durations> };
  plan: PlanSeries[];
  cost: { cli_usd: Figure<number>; by_kind: { kind: string; tokens: number; weight: number; share: number }[] };
  findings: { text: string; section: string }[];
};

/** Plain words for a figure's provenance, shown beside it; measured figures need none. */
export const provenanceNote = (p: Provenance) => (p === 'measured' ? '' : p === 'unknown' ? 'unknown' : p);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const seconds = (ms: number | null) => (ms === null ? 'unknown' : ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);
export const windowName = (w: string) => ({ five_hour: '5-hour', seven_day: '7-day' } as Record<string, string>)[w] ?? w.replace(/_/g, ' ');
export const providerName = (p: string) => ({ claude: 'Claude', codex: 'Codex' } as Record<string, string>)[p] ?? p;

/** A count in a few characters: 950, 1.2k, 34k, 1.5M. */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/** "1.2k tokens", or "tokens unknown" when the count was not reported. */
export function tokensLabel(n: number | null): string {
  return n === null ? 'tokens unknown' : `${compactNumber(n)} tokens`;
}

/** Input plus output tokens of a turn, or null when the turn reported none. */
export function tokenSum(t: { input: number; output: number } | null | undefined): number | null {
  return t ? t.input + t.output : null;
}

/** "1 agent", "3 agents"; `many` for irregular plurals ("2 fixes"). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

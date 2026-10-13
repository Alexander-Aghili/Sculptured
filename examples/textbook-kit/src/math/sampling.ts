export type Point = { x: number; y: number };

/** Bounded, finite sampling. Invalid points split the path; they are never silently joined. */
export function sampleCurve(fn: (t: number) => Point, from: number, to: number, count = 161): Array<Point | null> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Choose a finite increasing domain.');
  const n = Math.max(2, Math.min(1001, Math.floor(Number.isFinite(count) ? count : 161)));
  return Array.from({ length: n }, (_, i) => { const p = fn(from + (to - from) * i / (n - 1)); return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; });
}

export function curvePath(points: Array<Point | null>, scale = 60, center = 200): string {
  let connected = false;
  return points.map(p => { if (!p) { connected = false; return ''; } const move = connected ? 'L' : 'M'; connected = true; return `${move}${center + p.x * scale},${center - p.y * scale}`; }).join(' ');
}

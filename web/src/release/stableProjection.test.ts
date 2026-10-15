import { describe, expect, it } from 'vitest';
import { stableProjection } from './live';

type P = Parameters<typeof stableProjection>[1];
const make = (edges: [string, string][], x = 10): P => ({
  compiled: { name: 't', pods: [], seats: [{ id: 'a' }, { id: 'b' }], edges: edges.map(([from, to]) => ({ from, to, kind: 'collaborates_with', enforced: true })) } as unknown as P['compiled'],
  layout: { width: 100, height: 100, seats: { a: { x, y: 0, w: 10, h: 10 }, b: { x: 50, y: 0, w: 10, h: 10 } }, pods: {} } as unknown as P['layout'],
  labels: { 'a→b': '1 message observed' },
  unknown: 0,
});

describe('stableProjection', () => {
  it('keeps the previous drawing objects while nothing drawn has changed', () => {
    const prev = make([['a', 'b']]);
    const next = { ...make([['a', 'b']]), labels: { 'a→b': '2 messages observed' } };
    const out = stableProjection(prev, next);
    expect(out.compiled).toBe(prev.compiled);
    expect(out.layout).toBe(prev.layout);
    expect(out.labels).toEqual({ 'a→b': '2 messages observed' });
  });

  it('takes the new objects when an arrow or a position changes', () => {
    const prev = make([['a', 'b']]);
    expect(stableProjection(prev, make([['a', 'b'], ['b', 'a']])).compiled).not.toBe(prev.compiled);
    expect(stableProjection(prev, make([['a', 'b']], 20)).layout).not.toBe(prev.layout);
  });
});

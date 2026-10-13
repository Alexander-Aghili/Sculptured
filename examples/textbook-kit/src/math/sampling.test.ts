import { expect, it } from 'vitest';
import { curvePath, sampleCurve } from './sampling';
it('samples exact endpoints and preserves a known circular invariant', () => {
  const p = sampleCurve(t => ({ x: 2*Math.cos(t), y: 2*Math.sin(t) }), 0, 2*Math.PI);
  expect(p).toHaveLength(161); expect(p[0]).toEqual({x:2,y:0});
  for (const q of p) expect(q!.x*q!.x+q!.y*q!.y).toBeCloseTo(4, 12);
});
it('bounds work, rejects invalid domains and breaks rather than joins discontinuities', () => {
  expect(sampleCurve(t => ({ x:t,y:t }),0,1,100000)).toHaveLength(1001);
  expect(() => sampleCurve(t => ({x:t,y:t}),NaN,1)).toThrow();
  expect(curvePath([{x:0,y:0},null,{x:1,y:1}]).match(/M/g)).toHaveLength(2);
});

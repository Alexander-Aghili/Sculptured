import { expect, it } from 'vitest';
import { boxInView, visibleWorld } from './culling';

it('works out the part of the board on screen, with a margin, and keeps unmeasured boards whole', () => {
  // A 1000×600 viewport at zoom 0.5, panned so world (200, 100) is at the top left.
  const view = visibleWorld({ x: -100, y: -50, k: 0.5 }, 1000, 600, 0);
  expect(view).toEqual({ x0: 0, y0: 0, x1: 2304, y1: 1536 });
  expect(boxInView(view, { x: 400, y: 300, w: 200, h: 100 })).toBe(true);
  expect(boxInView(view, { x: 5000, y: 300, w: 200, h: 100 })).toBe(false);
  // Not measured yet (tests, a hidden tab): nothing is left out.
  expect(visibleWorld({ x: 0, y: 0, k: 1 }, 0, 0)).toBeNull();
  expect(boxInView(null, { x: 9e6, y: 9e6, w: 1, h: 1 })).toBe(true);
});

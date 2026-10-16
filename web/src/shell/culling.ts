import { useEffect, useState, type RefObject } from 'react';
import type { Bounds, Viewport } from './viewport';

/** Edges of the on-screen part round out to this step, so panning re-renders only now and then. */
const STEP = 256;

/**
 * The part of the board on screen, in world units, widened by `margin` and rounded out to STEP.
 * Null when the viewport has no size yet: then everything is drawn.
 */
export function visibleWorld(vp: Viewport, w: number, h: number, margin = 400): Bounds | null {
  if (!w || !h) return null;
  const down = (n: number) => Math.floor(n / STEP) * STEP;
  const up = (n: number) => Math.ceil(n / STEP) * STEP;
  return {
    x0: down(-vp.x / vp.k - margin),
    y0: down(-vp.y / vp.k - margin),
    x1: up((w - vp.x) / vp.k + margin),
    y1: up((h - vp.y) / vp.k + margin),
  };
}

export function boxInView(view: Bounds | null, b: { x: number; y: number; w: number; h: number }): boolean {
  return !view || (b.x < view.x1 && b.x + b.w > view.x0 && b.y < view.y1 && b.y + b.h > view.y0);
}

/** The element's size, kept current as it resizes ({0, 0} before it is measured). */
export function useElementSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSize((s) => (s.w === node.clientWidth && s.h === node.clientHeight ? s : { w: node.clientWidth, h: node.clientHeight })));
    ro.observe(node);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

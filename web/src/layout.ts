import type { CompiledRig } from './generated/CompiledRig';

export type Box = { x: number; y: number; w: number; h: number };
export type Layout = { pods: Record<string, Box>; seats: Record<string, Box>; width: number; height: number };

export const CARD_W = 200;
/**
 * Map card height budget (px), from the fixed line heights in styles.css:
 *   padding 8+8 = 16, border 1+1 = 2, 6 flex gaps of 2 = 12 (7 flex children: runtime, name,
 *   status, tool, tokens, last event, reason; lifecycle and activity share the status child),
 *   runtime 16, name 20 (one line, ellipsis), lifecycle 20, activity 20 (stacked, one line each),
 *   tool 18, tokens 18, last event 18, reason 2 lines x 18 = 36.
 *   16 + 2 + 12 + 16 + 20 + 20 + 20 + 18 + 18 + 18 + 36 = 196, rounded up to 200.
 */
export const CARD_H = 200;
export const GAP = 32;
/**
 * Horizontal gap between columns and between groups. Wider than GAP so a connection label
 * ("hands work to", about 100 px) sits between two boxes without covering either.
 */
export const COL_GAP = 120;
export const POD_PAD = 24;
export const POD_HEAD = 28;

/**
 * Pure function of the compiled spec, so status updates never move anything.
 * Pods go left to right in declaration order. Inside a pod, a seat's column is the
 * rank of its launch layer among the layers present in that pod; its row is its
 * order within that column.
 */
export function computeLayout(rig: CompiledRig): Layout {
  const layerOf = new Map<string, number>();
  rig.launch_layers.forEach((layer, i) => layer.forEach((id) => layerOf.set(id, i)));
  const pods: Record<string, Box> = {};
  const seats: Record<string, Box> = {};
  let x = 0;
  let height = 0;
  for (const pod of rig.pods) {
    const members = rig.seats.filter((s) => s.pod === pod.id);
    const cols = [...new Set(members.map((s) => layerOf.get(s.id) ?? 0))].sort((a, b) => a - b);
    const rowsInCol = new Map<number, number>();
    for (const s of members) {
      const c = cols.indexOf(layerOf.get(s.id) ?? 0);
      const r = rowsInCol.get(c) ?? 0;
      rowsInCol.set(c, r + 1);
      seats[s.id] = { x: x + POD_PAD + c * (CARD_W + COL_GAP), y: POD_HEAD + POD_PAD + r * (CARD_H + GAP), w: CARD_W, h: CARD_H };
    }
    const nCols = Math.max(cols.length, 1);
    const nRows = Math.max(1, ...rowsInCol.values());
    const w = POD_PAD * 2 + nCols * CARD_W + (nCols - 1) * COL_GAP;
    const h = POD_HEAD + POD_PAD * 2 + nRows * CARD_H + (nRows - 1) * GAP;
    pods[pod.id] = { x, y: 0, w, h };
    height = Math.max(height, h);
    x += w + COL_GAP;
  }
  return { pods, seats, width: Math.max(0, x - COL_GAP), height };
}

/** Append managed children without moving any saved card. Stable across status updates. */
export function withLiveChildren(saved: Layout, rig: CompiledRig): Layout {
  const seats={...saved.seats};
  for (const seat of rig.seats) {
    if (seats[seat.id]) continue;
    const edge = rig.edges.find(e => e.kind === 'spawned_by' && e.from === seat.id);
    if (!edge) continue;
    const parent = seats[edge.to];
    const box = {x: parent ? parent.x + parent.w + COL_GAP : saved.width + COL_GAP, y: parent?.y ?? 0, w:CARD_W, h:CARD_H};
    // Append in registration order. Later descendants never reposition earlier cards.
    while (Object.values(seats).some(b => box.x < b.x + b.w + GAP && box.x + box.w + GAP > b.x && box.y < b.y + b.h + GAP && box.y + box.h + GAP > b.y)) {
      box.y += CARD_H + GAP;
    }
    seats[seat.id] = box;
  }
  return {...saved,seats,height:Math.max(saved.height,...Object.values(seats).map(b=>b.y+b.h)),width:Math.max(saved.width,...Object.values(seats).map(b=>b.x+b.w))};
}

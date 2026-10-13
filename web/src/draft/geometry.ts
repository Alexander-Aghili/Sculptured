import type { DraftGroup } from '../generated/DraftGroup';
import type { TeamDraft } from '../generated/TeamDraft';
import { CARD_H, CARD_W, type Layout } from '../layout';
import { DEFAULT_GROUP_ID, groupOf, seatIdFor } from './ids';

export const GRID = 8;
export const STEP = 16;
export const BIG_STEP = 64;
/** Keyboard placement column; a multiple of GRID so placed cards stay on the grid. */
export const COL = 264;
export const ROW = 240;
export const MARGIN = 40;
export const GROUP_PAD = 24;
export const GROUP_HEAD = 28;
/** Space kept between two group boxes when one has to make room for the other. */
export const GROUP_GAP = 16;

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export const snap = (n: number) => Math.max(0, Math.round(n / GRID) * GRID);
export const agentBox = (p: Point): Box => ({ x: p.x, y: p.y, w: CARD_W, h: CARD_H });
export const contains = (b: Box, p: Point) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The topmost agent whose card contains `p`. */
export function agentAt(d: TeamDraft, p: Point): string | null {
  for (let i = d.agents.length - 1; i >= 0; i--) if (contains(agentBox(d.agents[i]), p)) return d.agents[i].id;
  return null;
}

/** The label the main group gets when the first group is added. */
export const MAIN_GROUP_LABEL = 'Main group';

/**
 * Groups are drawn once a team has two or more. A single group is drawn too unless it is the
 * main group (`team`) with its default label, which stays implicit. A main group you renamed is
 * drawn, so its label is never lost.
 */
export function drawnGroups(d: TeamDraft): DraftGroup[] {
  if (d.groups.length >= 2) return d.groups;
  return d.groups.filter((g) => g.id !== DEFAULT_GROUP_ID || g.label.trim() !== MAIN_GROUP_LABEL);
}

export function groupAt(d: TeamDraft, p: Point): string | null {
  const gs = drawnGroups(d);
  for (let i = gs.length - 1; i >= 0; i--) if (contains(gs[i], p)) return gs[i].id;
  return null;
}

/** The drawn group whose centre is closest to `p`. */
export function nearestGroup(d: TeamDraft, p: Point): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const g of drawnGroups(d)) {
    const dist = Math.hypot(g.x + g.w / 2 - p.x, g.y + g.h / 2 - p.y);
    if (!best || dist < best.dist) best = { id: g.id, dist };
  }
  return best?.id ?? null;
}

/** First grid slot (left to right, top to bottom) where a new card overlaps no agent. */
export function nextFreeSlot(d: TeamDraft): Point {
  for (let row = 0; row < 50; row++) {
    for (let col = 0; col < 6; col++) {
      const p = { x: MARGIN + col * COL, y: MARGIN + row * ROW };
      if (!d.agents.some((a) => overlaps(agentBox(a), agentBox(p)))) return p;
    }
  }
  return { x: MARGIN, y: MARGIN };
}

/** Rounds up / down to the grid. */
export const ceilGrid = (n: number) => Math.ceil(n / GRID) * GRID;
export const floorGrid = (n: number) => Math.floor(n / GRID) * GRID;

/**
 * The first slot inside group `groupId`, top to bottom, where a card overlaps none of the
 * group's other members (agents without a group belong to the main group). Positions are on
 * the grid and rounded up, so a slot never reaches into the box's padding. Slots below the box
 * are allowed: the group then grows to fit.
 */
export function firstFreeSlot(d: TeamDraft, groupId: string, exceptAgentId?: string): Point | null {
  const g = d.groups.find((x) => x.id === groupId);
  if (!g) return null;
  const others = d.agents.filter((a) => groupOf(a) === groupId && a.id !== exceptAgentId);
  const x = ceilGrid(g.x + GROUP_PAD);
  for (let row = 0; row < 50; row++) {
    const p = { x, y: ceilGrid(g.y + GROUP_HEAD + GROUP_PAD + row * (CARD_H + 40)) };
    if (!others.some((o) => overlaps(agentBox(o), agentBox(p)))) return p;
  }
  return { x, y: ceilGrid(g.y + GROUP_HEAD + GROUP_PAD) };
}

function extent(d: TeamDraft, extra: Point[]): { right: number; bottom: number } {
  let right = 0;
  let bottom = 0;
  for (const p of [...d.agents, ...extra]) {
    right = Math.max(right, p.x + CARD_W);
    bottom = Math.max(bottom, p.y + CARD_H);
  }
  for (const g of d.groups) {
    right = Math.max(right, g.x + g.w);
    bottom = Math.max(bottom, g.y + g.h);
  }
  return { right, bottom };
}

/** The editing surface: room to drop past the furthest card. */
export function canvasSize(d: TeamDraft, extra: Point[] = []): { width: number; height: number } {
  const { right, bottom } = extent(d, extra);
  return { width: Math.max(960, right + 400), height: Math.max(640, bottom + 400) };
}

/** A straight path between two cards' facing edges, and its midpoint for the label. */
export function connectionPath(a: Box, b: Box): { d: string; mid: Point } {
  const side = b.x >= a.x + a.w || b.x + b.w <= a.x;
  let x1: number, y1: number, x2: number, y2: number;
  if (side) {
    const forward = b.x >= a.x + a.w;
    x1 = forward ? a.x + a.w : a.x;
    y1 = a.y + a.h / 2;
    x2 = forward ? b.x : b.x + b.w;
    y2 = b.y + b.h / 2;
  } else {
    const down = b.y >= a.y;
    x1 = a.x + a.w / 2;
    y1 = down ? a.y + a.h : a.y;
    x2 = b.x + b.w / 2;
    y2 = down ? b.y : b.y + b.h;
  }
  return { d: `M${x1},${y1} L${x2},${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
}

/** Run mode uses the draft's own coordinates, keyed by seat id: nothing moves between modes. */
export function draftLayout(d: TeamDraft): Layout {
  const seats: Layout['seats'] = {};
  for (const a of d.agents) seats[seatIdFor(d, a.id)!] = agentBox(a);
  const pods: Layout['pods'] = {};
  for (const g of drawnGroups(d)) pods[g.id] = { x: g.x, y: g.y, w: g.w, h: g.h };
  const { right, bottom } = extent(d, []);
  return { seats, pods, width: right + MARGIN, height: bottom + MARGIN };
}

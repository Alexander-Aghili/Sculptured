import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Selection } from '../draft/edits';
import { BIG_STEP, STEP, type Point } from '../draft/geometry';
import { addInput, linkInput, moveInput, removeInput, teamInputBox, INPUT_W } from '../draft/input';
import type { Box } from '../layout';
import { INPUT_WIRE } from './InputNode';
import { LOCK_REASON, type Edit } from './Panels';

type Follow = (e: React.PointerEvent, move: (dx: number, dy: number, ev: PointerEvent) => void, end: (moved: boolean, ev: PointerEvent) => void) => void;

type Deps = {
  draft: TeamDraft;
  edit: Edit;
  locked: boolean;
  follow: Follow;
  setDrag: (d: { kind: 'team-input'; id: string; dx: number; dy: number } | null) => void;
  vpRef: React.RefObject<{ k: number }>;
  reveal: (b: Box) => void;
  dragged: React.RefObject<boolean>;
  pointerFocus: React.RefObject<boolean>;
  onSelect: (s: Selection | null) => void;
  setWire: (w: { from: string; to: Point } | null) => void;
  toWorld: (x: number, y: number) => Point;
  agentAt: (at: Point) => string | null;
  menuAt: (e: React.MouseEvent, target: { kind: 'input' }) => void;
  overViewport: (ev: PointerEvent) => boolean;
};

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The Input box on the board: add (click or drag in), move, open, connect to agents, remove. */
export function useTeamInput(p: Deps) {
  const [open, setOpen] = useState(false);
  const [ghost, setGhost] = useState<Point | null>(null);
  const add = (at?: Point) => {
    if (p.locked) return void p.edit((d) => ({ draft: d, reason: LOCK_REASON }));
    if (!p.edit((d) => addInput(d, at))) setOpen(true);
  };
  const box = () => teamInputBox(p.draft);
  return { open, setOpen, ghost, add, paletteDown: palette(p, setGhost, add), portDown: port(p), controls: controls(p, box, setOpen) };
}

function palette(p: Deps, setGhost: (g: Point | null) => void, add: (at: Point) => void) {
  return (e: React.PointerEvent) => {
    if (e.button !== 0 || p.locked) return;
    const at = (ev: PointerEvent) => { const w = p.toWorld(ev.clientX, ev.clientY); return { x: w.x - INPUT_W / 2, y: w.y - 24 }; };
    p.follow(e, (_dx, _dy, ev) => setGhost(p.overViewport(ev) ? at(ev) : null), (moved, ev) => {
      setGhost(null);
      if (moved && p.overViewport(ev)) add(at(ev));
    });
  };
}

function port(p: Deps) {
  return (e: React.PointerEvent) => {
    if (e.button !== 0 || p.locked) return;
    e.stopPropagation();
    e.preventDefault();
    p.follow(e, (_dx, _dy, ev) => p.setWire({ from: INPUT_WIRE, to: p.toWorld(ev.clientX, ev.clientY) }), (moved, ev) => {
      p.setWire(null);
      const to = moved ? p.agentAt(p.toWorld(ev.clientX, ev.clientY)) : null;
      if (to) p.edit((d) => linkInput(d, to, true));
    });
  };
}

function controls(p: Deps, box: () => Box | null, setOpen: (o: boolean) => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      const b = box();
      if (e.button !== 0 || !b) return;
      e.stopPropagation();
      p.pointerFocus.current = true;
      p.dragged.current = false;
      p.follow(e, (dx, dy) => p.setDrag({ kind: 'team-input', id: 'input', dx, dy }), (moved, ev) => {
        p.pointerFocus.current = false;
        p.setDrag(null);
        if (!moved) return;
        p.dragged.current = true;
        const k = p.vpRef.current.k;
        p.edit((d) => moveInput(d, { x: b.x + (ev.clientX - e.clientX) / k, y: b.y + (ev.clientY - e.clientY) / k }));
      });
    },
    onFocus: () => { p.onSelect(null); const b = box(); if (b && !p.pointerFocus.current) p.reveal(b); },
    onClick: () => { if (p.dragged.current) p.dragged.current = false; else setOpen(true); },
    onContextMenu: (e: React.MouseEvent) => p.menuAt(e, { kind: 'input' }),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => keys(p, box, e),
    title: 'Drag to move · Arrow keys to move · Enter to open · Delete to remove',
  };
}

function keys(p: Deps, box: () => Box | null, e: React.KeyboardEvent) {
  const b = box();
  if (!b || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();
    p.edit((d) => (p.locked ? { draft: d, reason: LOCK_REASON } : removeInput(d)));
    return;
  }
  const dir = ARROWS[e.key];
  if (!dir) return;
  e.preventDefault();
  e.stopPropagation();
  const step = e.shiftKey ? BIG_STEP : STEP;
  const at = { x: b.x + dir[0] * step, y: b.y + dir[1] * step };
  p.edit((d) => moveInput(d, at), 'move:team-input');
  p.reveal({ ...b, ...at });
}

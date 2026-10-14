import type { CompiledRig } from '../generated/CompiledRig';

/** A parent with more than this many spawned children shows `SHOWN_CHILDREN` of them and "+N more". */
export const MAX_DRAWN_CHILDREN = 6;
export const SHOWN_CHILDREN = 5;
/** Children below this level fold into "+N deeper" on their ancestor at this level. */
export const DRAWN_LEVELS = 3;

/** Spawned agents the board does not draw, and where it says so. Hidden agents keep their saved boxes. */
export type ChildFold = {
  hidden: Set<string>;
  /** Parent → its children past the first five (in spawn order), drawn as one "+N more" card. */
  more: Map<string, string[]>;
  /** Level-3 agent → every agent below it, as a "+N deeper" chip on its card. */
  deeper: Map<string, string[]>;
};

/** Every agent below `id`, in spawn order. */
function descendants(id: string, kids: Map<string, string[]>): string[] {
  return (kids.get(id) ?? []).flatMap((k) => [k, ...descendants(k, kids)]);
}

/**
 * Which spawned agents to draw: the board stays readable however many there are. Pure. `rig` is the live
 * projection the Run board draws, whose `spawned_by` arrows point down, parent → child (`liveProjection`);
 * the compiled rig's own edges point the other way.
 */
export function foldChildren(rig: CompiledRig): ChildFold {
  const parentOf = new Map(rig.edges.filter((e) => e.kind === 'spawned_by').map((e) => [e.to, e.from]));
  const kids = new Map<string, string[]>();
  for (const s of rig.seats) {
    const p = parentOf.get(s.id);
    if (p) kids.set(p, [...(kids.get(p) ?? []), s.id]);
  }
  const level = (id: string): number => (parentOf.has(id) ? 1 + level(parentOf.get(id)!) : 0);
  const fold: ChildFold = { hidden: new Set(), more: new Map(), deeper: new Map() };
  const hide = (ids: string[]) => ids.forEach((id) => fold.hidden.add(id));
  for (const [parent, children] of kids) {
    if (fold.hidden.has(parent)) continue;
    if (level(parent) === DRAWN_LEVELS) {
      fold.deeper.set(parent, descendants(parent, kids));
      hide(fold.deeper.get(parent)!);
    } else if (children.length > MAX_DRAWN_CHILDREN) {
      fold.more.set(parent, children.slice(SHOWN_CHILDREN));
      hide(children.slice(SHOWN_CHILDREN).flatMap((c) => [c, ...descendants(c, kids)]));
    }
  }
  return fold;
}

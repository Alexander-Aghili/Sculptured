import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, COL_GAP, computeLayout, GAP, POD_HEAD, POD_PAD } from './layout';
import { compiledRig } from './test-fixtures';
import type { CompiledRig } from './generated/CompiledRig';

describe('computeLayout', () => {
  it('puts seats in columns by launch layer inside their pod', () => {
    const l = computeLayout(compiledRig());
    expect(l.seats['dev.a@r']).toEqual({ x: POD_PAD, y: POD_HEAD + POD_PAD, w: CARD_W, h: CARD_H });
    expect(l.seats['dev.b@r'].x).toBe(POD_PAD + CARD_W + COL_GAP);
    expect(l.seats['dev.b@r'].y).toBe(l.seats['dev.a@r'].y);
    expect(l.pods.dev.w).toBe(POD_PAD * 2 + CARD_W * 2 + COL_GAP);
  });

  it('is a pure function of the compiled rig', () => {
    const rig = compiledRig();
    expect(computeLayout(rig)).toEqual(computeLayout(structuredClone(rig)));
  });

  it('places pods left to right and stacks same-layer seats', () => {
    const base = compiledRig();
    const rig: CompiledRig = {
      ...base,
      pods: [...base.pods, { id: 'rev', label: 'Review' }],
      seats: [
        ...base.seats,
        { ...base.seats[0], id: 'rev.x@r', pod: 'rev', member: 'x' },
        { ...base.seats[0], id: 'rev.y@r', pod: 'rev', member: 'y' },
      ],
      launch_layers: [['dev.a@r', 'rev.x@r', 'rev.y@r'], ['dev.b@r']],
    };
    const l = computeLayout(rig);
    expect(l.pods.rev.x).toBe(l.pods.dev.w + COL_GAP);
    expect(l.seats['rev.x@r'].x).toBe(l.pods.rev.x + POD_PAD);
    expect(l.seats['rev.y@r'].y).toBe(l.seats['rev.x@r'].y + CARD_H + GAP);
    expect(l.width).toBe(l.pods.rev.x + l.pods.rev.w);
  });

  it('starts a pod whose seats are all in a later layer at its own column 0', () => {
    const base = compiledRig();
    const rig: CompiledRig = { ...base, launch_layers: [['dev.a@r'], ['dev.b@r']], pods: [{ id: 'dev', label: 'Dev' }, { id: 'late', label: 'Late' }], seats: [...base.seats, { ...base.seats[0], id: 'late.z@r', pod: 'late', member: 'z' }] };
    rig.launch_layers = [['dev.a@r'], ['dev.b@r'], ['late.z@r']];
    const l = computeLayout(rig);
    expect(l.seats['late.z@r'].x).toBe(l.pods.late.x + POD_PAD);
    expect(l.pods.late.w).toBe(POD_PAD * 2 + CARD_W);
  });
});

it('appends managed children without moving saved nodes and preserves parent arrows',async()=>{
  const {withLiveChildren}=await import('./layout');const rig=compiledRig(),saved=computeLayout(rig);
  const child={...rig.seats[0],id:'dev.child@r',member:'child'};
  const live={...rig,seats:[...rig.seats,child],edges:[...rig.edges,{kind:'spawned_by' as const,from:child.id,to:rig.seats[0].id,enforced:true}]};
  const layout=withLiveChildren(saved,live);expect(layout.seats[rig.seats[0].id]).toEqual(saved.seats[rig.seats[0].id]);expect(layout.seats[child.id].x).toBeGreaterThan(saved.seats[rig.seats[0].id].x);expect(live.edges.at(-1)?.to).toBe(rig.seats[0].id);expect(withLiveChildren(saved,live)).toEqual(layout);
});

it('places nested generations in separate columns without moving existing descendants', async()=>{
  const {withLiveChildren}=await import('./layout');
  const rig=compiledRig(); const saved=computeLayout(rig);
  const parent=rig.seats[0];
  const child={...parent,id:'dev.child@r',member:'child'};
  const leaf={...parent,id:'dev.leaf@r',member:'leaf'};
  rig.seats.push(child);rig.edges.push({kind:'spawned_by',from:child.id,to:parent.id,enforced:true});
  const before=withLiveChildren(saved,rig);
  rig.seats.push(leaf);rig.edges.push({kind:'spawned_by',from:leaf.id,to:child.id,enforced:true});
  const after=withLiveChildren(saved,rig);
  expect(after.seats[child.id]).toEqual(before.seats[child.id]);
  expect(after.seats[leaf.id].x).toBeGreaterThan(after.seats[child.id].x);
  for(const [a,box] of Object.entries(after.seats)) for(const [b,other] of Object.entries(after.seats)) {
    if(a!==b)expect(box.x >= other.x+other.w || other.x >= box.x+box.w || box.y >= other.y+other.h || other.y >= box.y+box.h).toBe(true);
  }
});

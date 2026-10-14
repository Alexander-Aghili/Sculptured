import { expect, it } from 'vitest';
import { liveProjection } from '../release/live';
import { compiledRig, seatSpec, seatView } from '../test-fixtures';
import { foldChildren } from './childFold';

/** A running team whose agent `a` spawned `n` children, as the Run board receives it (the live projection). */
function liveTeam(n: number) {
  const base = compiledRig();
  const kids = Array.from({ length: n }, (_, i) => `c${i}`);
  const rig = {
    ...base,
    seats: [...base.seats, ...kids.map((k) => seatSpec(k))],
    edges: [...base.edges, ...kids.map((k) => ({ kind: 'spawned_by' as const, from: `dev.${k}@r`, to: 'dev.a@r', enforced: true }))],
  };
  const seats = Object.fromEntries(rig.seats.map((s) => [s.id, seatView(s.member, { lifecycle: 'running' })]));
  const children = kids.map((k) => ({ parent: 'dev.a@r', child: `dev.${k}@r` }));
  return liveProjection(rig, seats, [], undefined, children).compiled;
}

it('folds a running parent with eight children, as the Run board draws it', () => {
  const fold = foldChildren(liveTeam(8));
  expect([...fold.more.keys()]).toEqual(['dev.a@r']);
  expect(fold.more.get('dev.a@r')).toEqual(['dev.c5@r', 'dev.c6@r', 'dev.c7@r']);
  expect(fold.hidden.size).toBe(3);
});

it('draws every child of a parent with six', () => {
  expect(foldChildren(liveTeam(6)).hidden.size).toBe(0);
});

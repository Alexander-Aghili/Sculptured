import { expect, it } from 'vitest';
import { hasProcess, isRestartable, isStoppable, needsAttention } from './status';
import type { SeatLifecycle } from './generated/SeatLifecycle';

const ALL: SeatLifecycle[] = ['planned', 'launching', 'running', 'stopping', 'stopped', 'stale', 'attention', 'failed'];
const which = (p: (l: SeatLifecycle) => boolean) => ALL.filter(p);

it('names each group of agent states once', () => {
  expect(which(hasProcess)).toEqual(['launching', 'running', 'stopping', 'stale']);
  expect(which(needsAttention)).toEqual(['stale', 'attention', 'failed']);
  expect(which(isStoppable)).toEqual(['launching', 'running', 'stale', 'attention']);
  expect(which(isRestartable)).toEqual(['stopped', 'attention', 'failed']);
});

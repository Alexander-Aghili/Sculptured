import { describe, expect, it } from 'vitest';
import { seatView } from '../test-fixtures';
import { nowSummary } from './summary';

describe('nowSummary', () => {
  it('summarises the team in one sentence', () => {
    expect(
      nowSummary([
        { name: 'Builder', seat: seatView('b', { activity: 'working' }) },
        { name: 'Planner', seat: seatView('p', { activity: 'idle', current_tool: 'Bash' }) },
        { name: 'Reviewer', seat: seatView('r', { lifecycle: 'attention', lifecycle_reason: 'working directory does not exist' }) },
      ]),
    ).toBe('2 agents working, 1 needs attention: Reviewer — working directory does not exist.');
    expect(nowSummary([{ name: 'A', seat: seatView('a') }, { name: 'B', seat: undefined }])).toBe('1 agent idle, 1 unknown.');
    expect(nowSummary([])).toBe('This team has no agents yet.');
    expect(nowSummary([{ name: 'A', seat: seatView('a', { lifecycle: 'stopped' }) }])).toBe('1 agent stopped.');
  });

  it('keeps not-started, starting/stopping and unreachable agents apart', () => {
    expect(nowSummary([{ name: 'A', seat: seatView('a', { lifecycle: 'planned' }) }])).toBe('1 agent not started.');
    expect(nowSummary([{ name: 'A', seat: seatView('a', { lifecycle: 'launching' }) }])).toBe('1 agent starting or stopping.');
    expect(nowSummary([{ name: 'A', seat: seatView('a', { lifecycle: 'stopping' }) }])).toBe('1 agent starting or stopping.');
    expect(nowSummary([{ name: 'A', seat: seatView('a', { lifecycle: 'stale', lifecycle_reason: null }) }])).toBe('1 needs attention: A — reason unknown.');
    expect(
      nowSummary([
        { name: 'A', seat: seatView('a', { lifecycle: 'planned' }) },
        { name: 'B', seat: seatView('b', { lifecycle: 'planned' }) },
        { name: 'C', seat: seatView('c', { lifecycle: 'launching' }) },
      ]),
    ).toBe('1 agent starting or stopping, 2 agents not started.');
  });
});

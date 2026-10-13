import { describe, expect, it } from 'vitest';
import { seatView } from '../test-fixtures';
import { describeActivity, sinceText, toolWords } from './activity';

const now = 10 * 3_600_000;

describe('describeActivity', () => {
  it('says what a running agent is doing, in words', () => {
    expect(describeActivity(seatView('a', { activity: 'working', current_tool: 'Bash' }), now)).toBe('running a shell command');
    expect(describeActivity(seatView('a', { activity: 'working', current_tool: 'Edit' }), now)).toBe('editing files');
    expect(describeActivity(seatView('a', { activity: 'working', current_tool: 'WebFetch' }), now)).toBe('using WebFetch');
    expect(describeActivity(seatView('a', { activity: 'working' }), now)).toBe('working');
    expect(describeActivity(seatView('a', { activity: 'waiting-input' }), now)).toBe('waiting for input');
    expect(describeActivity(seatView('a', { activity: 'idle', last_event_ms: now - 12 * 60_000 }), now)).toBe('idle for 12 min');
    expect(describeActivity(seatView('a', { activity: 'idle', last_event_ms: now - 20_000 }), now)).toBe('idle for under a minute');
    expect(describeActivity(seatView('a', { activity: 'idle', last_event_ms: null }), now)).toBe('idle, for an unknown time');
    expect(describeActivity(seatView('a', { activity: 'unknown' }), now)).toBe('unknown');
  });

  it('never guesses: no seat is unknown, and a stopped agent is not "idle"', () => {
    expect(describeActivity(undefined, now)).toBe('unknown');
    expect(describeActivity(seatView('a', { lifecycle: 'stopped', activity: 'idle' }), now)).toBe('stopped');
    expect(describeActivity(seatView('a', { lifecycle: 'attention', current_tool: 'Bash' }), now)).toBe('needs attention');
  });

  it('words for tools and times', () => {
    expect(toolWords('apply_patch')).toBe('editing files');
    expect(toolWords('Read')).toBe('reading files');
    expect(toolWords('Agent')).toBe('running a helper agent');
    expect(sinceText(null, now)).toBe('unknown');
    expect(sinceText(now - 30_000, now)).toBe('just now');
    expect(sinceText(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(sinceText(now - 3 * 3_600_000, now)).toBe('3 h ago');
  });
});

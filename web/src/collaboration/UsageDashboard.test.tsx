import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../api';
import { seriesOf, UsageDashboard } from './UsageDashboard';

afterEach(() => vi.restoreAllMocks());
const agent = (seat: string, out: number, context: { used_tokens: number; window_tokens: number | null } | null = null) => ({
  seat, reports: 2,
  points: [{ at_ms: 1000, input: 10, output: 1, cache_read: 0 }, { at_ms: 61000, input: 100, output: out, cache_read: 5 }],
  context: context && { at_ms: 61000, estimated: false, ...context },
});

it('charts each agent, lists every agent with its context fill, and says when nothing was reported', async () => {
  vi.spyOn(api, 'teamUsage').mockResolvedValue({ agents: [agent('a@t', 50, { used_tokens: 50000, window_tokens: 200000 }), { seat: 'p@t', reports: 0, points: [], context: null }] });
  render(<MemoryRouter><UsageDashboard rig="t" names={{}} onClose={() => {}} /></MemoryRouter>);
  expect(await screen.findByRole('img', { name: /Running token totals for 1 lines/ })).toBeInTheDocument();
  expect(screen.getByText('50k of 200k (25%)')).toBeInTheDocument();
  expect(screen.getByText('none reported')).toBeInTheDocument();
  expect(screen.getByText('unknown')).toBeInTheDocument();
});

it('charts the seven busiest agents and keeps each colour on its agent', () => {
  const many = Array.from({ length: 9 }, (_, i) => agent(`s${i}@t`, 1000 * (i + 1)));
  const s = seriesOf(many, (id) => id);
  expect(s.map((x) => x.key)).toEqual(['s2@t', 's3@t', 's4@t', 's5@t', 's6@t', 's7@t', 's8@t']);
  const fewer = seriesOf(many.slice(2), (id) => id);
  expect(fewer.find((x) => x.key === 's8@t')!.color).toBe(s.find((x) => x.key === 's8@t')!.color);
});

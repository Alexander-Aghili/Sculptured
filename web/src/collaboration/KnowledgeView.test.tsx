import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api';
import type { Knowledge } from '../knowledge';
import { KnowledgeView } from './KnowledgeView';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return { ...m, api: { ...m.api, knowledge: vi.fn(), confirmDecision: vi.fn(), hideDecision: vi.fn() } };
});

const k: Knowledge = {
  maps: [{ folder: '/home/me/c172', at_ms: 1_800_000_000_000, workers: { 'cad/wings': ['Developer 3'] }, map: {
    root: '/home/me/c172', files: 3, truncated: false, file: '.sculptured/map.md',
    areas: [{ path: 'cad/wings', files: 3, kinds: [['step', 2], ['md', 1]], about: 'Wing parts', docs: [{ file: 'cad/wings/README.md', sections: [{ title: 'Spar', line: 5, end: 11 }] }] }],
  } }],
  entries: [
    { id: 'l1', at_ms: 1_800_000_000_000, author: 'Developer 3', text: 'Reuse the bus.', source: 'lesson', hidden_ms: null, confirmed_ms: null },
    { id: 'd1', at_ms: 1_700_000_000_000, author: 'You', text: 'Units are mm.', source: 'person', hidden_ms: null, confirmed_ms: null },
  ],
};

describe('Knowledge', () => {
  it('shows what agents learned and the project map, and lets you confirm a lesson', async () => {
    vi.mocked(api.knowledge).mockResolvedValue(k);
    vi.mocked(api.confirmDecision).mockResolvedValue({ confirmed: 'l1' });
    render(<KnowledgeView rig="c172" onClose={vi.fn()} />);
    const lessons = await screen.findByRole('region', { name: 'Lessons and decisions' });
    expect(within(lessons).getByText('Reuse the bus.')).toBeInTheDocument();
    expect(within(lessons).getByText(/Units are mm/)).toBeInTheDocument();
    const map = screen.getByRole('region', { name: 'Project map' });
    expect(within(map).getByText('cad/wings')).toBeInTheDocument();
    expect(within(map).getByText(/worked on by Developer 3/)).toBeInTheDocument();
    expect(within(map).getByText(/Spar · lines 5–11/)).toBeInTheDocument();
    await userEvent.click(within(lessons).getByRole('button', { name: 'Confirm lesson: Reuse the bus.' }));
    expect(api.confirmDecision).toHaveBeenCalledWith('c172', 'l1');
  });
});

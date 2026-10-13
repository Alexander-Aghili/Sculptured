import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { seatView } from '../test-fixtures';
import { RestoreBanner } from './RestoreBanner';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return { ...m, api: { ...m.api, restoreTeam: vi.fn().mockResolvedValue({}) } };
});

describe('RestoreBanner', () => {
  it('asks once for the team and sends the answer', async () => {
    const offer = { reason: 'process ended', can_resume: true };
    const views = [seatView('a', { restore_offer: offer }), seatView('b', { restore_offer: offer }), seatView('c')];
    render(<RestoreBanner team="t" views={views} names={{}} />);
    expect(screen.getByRole('region', { name: 'Agents waiting to resume' })).toHaveTextContent('2 agents stopped mid-work');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resume' }));
    expect(api.restoreTeam).toHaveBeenCalledWith('t', 'resume');
  });

  it('renders nothing when no agent is waiting', () => {
    const { container } = render(<RestoreBanner team="t" views={[seatView('a')]} names={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

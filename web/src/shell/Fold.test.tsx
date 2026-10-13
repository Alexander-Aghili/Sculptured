import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { vendor } from '../herdr';
import { ev } from '../test-fixtures';
import { Fold, isLong } from './Fold';
import { Transcript } from './Transcript';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return { ...m, api: { ...m.api, latestSeatEvents: vi.fn() } };
});

const LONG = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of a long reply.`).join('\n');

describe('Fold', () => {
  it('calls text long past either its character or its line limit', () => {
    expect(isLong('short')).toBe(false);
    expect(isLong('x'.repeat(1201))).toBe(true);
    expect(isLong(LONG)).toBe(true);
    expect(isLong('a\nb\nc', { chars: 100, lines: 2 })).toBe(true);
    expect(isLong('a\n\n\nb', { chars: 100, lines: 2 })).toBe(false);
  });

  it('leaves short text alone', () => {
    const { container } = render(<Fold text="short">short</Fold>);
    expect(container.querySelector('.fold')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('folds long text behind "Show more" and opens it in place', async () => {
    const { container } = render(<Fold text={LONG}>{LONG}</Fold>);
    const fold = container.querySelector('.fold')!;
    expect(fold).toHaveAttribute('data-open', 'false');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(fold).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens when forced, and stays open until you fold it', async () => {
    const { container, rerender } = render(<Fold text={LONG}>{LONG}</Fold>);
    rerender(<Fold text={LONG} force>{LONG}</Fold>);
    expect(container.querySelector('.fold')).toHaveAttribute('data-open', 'true');
    rerender(<Fold text={LONG}>{LONG}</Fold>);
    expect(container.querySelector('.fold')).toHaveAttribute('data-open', 'true');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show less' }));
    expect(container.querySelector('.fold')).toHaveAttribute('data-open', 'false');
  });
});

describe('Transcript folds', () => {
  beforeEach(() => vi.mocked(api.latestSeatEvents).mockReset());

  const reply = (seq: number, text: string) => ({ ...ev(seq, { type: 'agent-text', turn_id: 't', text }), provenance: 'agent-reported' as const });

  it('folds a long earlier reply, keeps all of it in the page, and opens it for a search hit inside', async () => {
    vi.mocked(api.latestSeatEvents).mockResolvedValue([reply(1, LONG), ev(2, { type: 'turn-ended', turn_id: 't', status: 'completed' }), reply(3, 'Done.')]);
    const { container } = render(<Transcript seatId="dev.a@r" feed={[]} epoch={0} vendor={vendor('claude-code')} name="Builder" />);
    await screen.findByText(/Line 30 of a long reply/);
    const fold = container.querySelector('.fold')!;
    expect(fold).toHaveAttribute('data-open', 'false');
    expect(fold.querySelector('.reply-text')).toHaveAttribute('data-raw-evidence');
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Search transcript' }), 'line 29');
    expect(fold).toHaveAttribute('data-open', 'true');
  });

  it('leaves the latest reply open however long it is', async () => {
    vi.mocked(api.latestSeatEvents).mockResolvedValue([reply(1, LONG)]);
    const { container } = render(<Transcript seatId="dev.a@r" feed={[]} epoch={0} vendor={vendor('claude-code')} name="Builder" />);
    await screen.findByText(/Line 30 of a long reply/);
    expect(container.querySelector('.fold')).toHaveAttribute('data-open', 'true');
  });
});

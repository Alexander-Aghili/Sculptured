import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../api';
import { CheckDetails, CheckMark } from './CheckMark';

afterEach(() => vi.restoreAllMocks());
const check = { command: 'npm test', passed: false as boolean | null, exit_code: 1 as number | null, timed_out: false, output: '1 failing', at_ms: 0, duration_ms: 1200 as number | null };

it('says what the command itself reported, never more', () => {
  const { rerender } = render(<CheckMark check={check} />);
  expect(screen.getByText('check failed')).toHaveAttribute('data-check', 'failed');
  rerender(<CheckMark check={{ ...check, passed: true, exit_code: 0 }} />);
  expect(screen.getByText('check passed').title).toContain('exit 0');
  rerender(<CheckMark check={{ ...check, passed: null, exit_code: null, duration_ms: null }} />);
  expect(screen.getByText('checking')).toBeInTheDocument();
});

it('shows the output and runs the check again on request', async () => {
  const run = vi.spyOn(api, 'runCheck').mockResolvedValue(null);
  render(<CheckDetails seat="team.a@t" check={check} />);
  expect(screen.getByText('1 failing')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Run check now' }));
  expect(run).toHaveBeenCalledWith('team.a@t');
});

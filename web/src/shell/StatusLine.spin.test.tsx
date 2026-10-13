import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { StatusLine } from './StatusLine';

const counts = (working: number) => ({ working, 'needs-you': 0, idle: 0, done: 0, failed: 0, stopped: 0, planned: 0, starting: 0, stuck: 0 }) as never;

it('spins the working ring only while something is working', () => {
  const { container, rerender } = render(<MemoryRouter><StatusLine counts={counts(0)} now={0} onGoto={() => {}} onHelp={() => {}} /></MemoryRouter>);
  expect(container.querySelector('.sl-counts .spin')).toBeNull();
  rerender(<MemoryRouter><StatusLine counts={counts(2)} now={0} onGoto={() => {}} onHelp={() => {}} /></MemoryRouter>);
  expect(container.querySelector('.sl-counts .spin')).not.toBeNull();
});

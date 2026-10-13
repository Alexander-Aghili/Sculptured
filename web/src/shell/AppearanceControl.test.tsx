import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceControl } from './AppearanceControl';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, FONTS, readAppearance } from '../appearance';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); document.documentElement.removeAttribute('style'); delete document.documentElement.dataset.surface; });

describe('Appearance', () => {
  it('persists font, text size and surface changes across remounts', async () => {
    const user = userEvent.setup();
    const first = render(<AppearanceControl />);
    await user.click(screen.getByRole('button', { name: 'Appearance' }));
    await user.selectOptions(screen.getByLabelText('Interface font'), 'humanist');
    await user.click(screen.getByRole('button', { name: 'Larger text' }));
    await user.click(screen.getByRole('checkbox', { name: /Translucent surfaces/ }));
    expect(document.documentElement.style.getPropertyValue('--ui-size')).toBe('14px');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toBe(FONTS.humanist.value);
    expect(document.documentElement.dataset.surface).toBe('solid');
    first.unmount();
    render(<AppearanceControl />);
    await user.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByLabelText('Interface font')).toHaveValue('humanist');
    expect(screen.getByRole('slider', { name: /Text size/ })).toHaveValue('14');
    await user.click(screen.getByRole('button', { name: 'Reset defaults' }));
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('contains keyboard focus, suppresses app shortcuts, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(<AppearanceControl />);
    await user.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByRole('button', { name: 'Close appearance' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close appearance' })).toHaveFocus();
    const handler = vi.fn();
    window.addEventListener('keydown', handler);
    await user.keyboard('n');
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('keydown', handler);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveFocus();
  });

  it('rejects malformed or out-of-range saved preferences', () => {
    for (const raw of ['{', 'null', '42', '{"font":"__proto__","size":99,"glass":"true"}']) {
      localStorage.setItem(APPEARANCE_KEY, raw);
      expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it('still applies settings when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    render(<AppearanceControl />);
    await user.click(screen.getByRole('button', { name: 'Appearance' }));
    await user.click(screen.getByRole('button', { name: 'Smaller text' }));
    expect(document.documentElement.style.getPropertyValue('--ui-size')).toBe('12px');
    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeDisabled();
  });
});

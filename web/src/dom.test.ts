import { describe, expect, it, vi } from 'vitest';
import { isTextField, trackPointer } from './dom';

const pe = (type: string, x: number, y: number, pointerId = 1) => new PointerEvent(type, { clientX: x, clientY: y, pointerId });

describe('isTextField', () => {
  const input = (type: string) => Object.assign(document.createElement('input'), { type });

  it('is true for fields that take typing', () => {
    for (const t of ['text', 'search', 'number', 'email', 'password']) expect(isTextField(input(t)), t).toBe(true);
    expect(isTextField(document.createElement('textarea'))).toBe(true);
    expect(isTextField(document.createElement('select'))).toBe(true);
  });

  it('is false for checkbox, radio and button inputs, other elements and null', () => {
    for (const t of ['checkbox', 'radio', 'button', 'submit', 'reset', 'image']) expect(isTextField(input(t)), t).toBe(false);
    expect(isTextField(document.createElement('div'))).toBe(false);
    expect(isTextField(document.createElement('button'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('trackPointer', () => {
  it('reports moves past 4 px and the release, as a drag', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    trackPointer({ clientX: 10, clientY: 10, pointerId: 1 }, onMove, onEnd);
    window.dispatchEvent(pe('pointermove', 12, 11));
    expect(onMove).not.toHaveBeenCalled();
    window.dispatchEvent(pe('pointermove', 30, 40));
    expect(onMove).toHaveBeenCalledWith(20, 30, expect.any(PointerEvent));
    window.dispatchEvent(pe('pointerup', 30, 40));
    expect(onEnd).toHaveBeenCalledWith(true, expect.any(PointerEvent));
    window.dispatchEvent(pe('pointermove', 90, 90));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('ignores other pointers', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    trackPointer({ clientX: 0, clientY: 0, pointerId: 1 }, onMove, onEnd);
    window.dispatchEvent(pe('pointermove', 100, 100, 2));
    window.dispatchEvent(pe('pointerup', 100, 100, 2));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    window.dispatchEvent(pe('pointerup', 0, 0, 1));
    expect(onEnd).toHaveBeenCalledWith(false, expect.any(PointerEvent));
  });

  it('returns a cleanup that stops listening, for an unmount mid-drag', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const stop = trackPointer({ clientX: 0, clientY: 0, pointerId: 1 }, onMove, onEnd);
    stop();
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(['pointercancel', 'pointermove', 'pointerup']);
    remove.mockRestore();
    window.dispatchEvent(pe('pointermove', 100, 100));
    window.dispatchEvent(pe('pointerup', 100, 100));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});

it('stops text from being selected while something is dragged, and allows it again after', () => {
  const end = vi.fn();
  trackPointer({ clientX: 0, clientY: 0, pointerId: 1 }, () => {}, end);
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 0, pointerId: 1 }));
  expect(document.documentElement.classList.contains('pointer-dragging')).toBe(true);
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: 30, clientY: 0, pointerId: 1 }));
  expect(document.documentElement.classList.contains('pointer-dragging')).toBe(false);
  expect(end).toHaveBeenCalledWith(true, expect.anything());
});

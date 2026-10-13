/** Input types that are pressed, not typed into: keyboard shortcuts still apply while they have focus. */
const NOT_TYPED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image']);

export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLInputElement) return !NOT_TYPED.has(t.type);
  return t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/**
 * Follows a pointer from `start` until release. Listens on window so a drag that leaves
 * its element still ends. Movement under 4 px is a click, not a drag. When `start` carries
 * a `pointerId` (a pointer event does), events from other pointers are ignored.
 * Returns a cleanup that stops listening without calling `onEnd`, for an unmount mid-drag.
 */
export function trackPointer(
  start: { clientX: number; clientY: number; pointerId?: number },
  onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  onEnd: (moved: boolean, ev: PointerEvent) => void,
): () => void {
  let moved = false;
  const other = (ev: PointerEvent) =>
    typeof start.pointerId === 'number' && typeof ev.pointerId === 'number' && ev.pointerId !== start.pointerId;
  const move = (ev: PointerEvent) => {
    if (other(ev)) return;
    const dx = ev.clientX - start.clientX;
    const dy = ev.clientY - start.clientY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) {
      // A drag never selects text on its way across the page.
      document.documentElement.classList.add('pointer-dragging');
      window.getSelection()?.removeAllRanges();
    }
    moved = true;
    onMove(dx, dy, ev);
  };
  const done = (ev: PointerEvent) => {
    if (other(ev)) return;
    stop();
    onEnd(moved && ev.type === 'pointerup', ev);
  };
  const unlisten = listenOnWindow(move, done);
  const stop = () => { document.documentElement.classList.remove('pointer-dragging'); unlisten(); };
  return stop;
}

/** Window-wide pointer move and release listeners; returns their removal. */
function listenOnWindow(move: (ev: PointerEvent) => void, done: (ev: PointerEvent) => void): () => void {
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', done);
  window.addEventListener('pointercancel', done);
  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', done);
    window.removeEventListener('pointercancel', done);
  };
}

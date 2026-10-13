import { useEffect } from 'react';
import { STATES } from '../herdr';
import { Icon } from './ui';

export type Toast = { id: number; agent: string; rig: string; name: string; kind: 'needs-you' | 'done'; team?: string };

/** "done" toasts dismiss themselves after this; "needs you" stays until clicked. */
export const TOAST_MS = 6000;

function ToastItem({ t, onOpen, onDismiss }: { t: Toast; onOpen: (t: Toast) => void; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (t.kind !== 'done') return;
    const timer = setTimeout(() => onDismiss(t.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [t, onDismiss]);
  const s = STATES[t.kind];
  return (
    <li className={`toast st-${t.kind} tone-${s.tone}`}>
      <button type="button" className="toast-open" onClick={() => onOpen(t)}>
        <span className="glyph" aria-hidden="true">
          {s.glyph}
        </span>{' '}
        <span className="toast-name">{t.name}</span> {s.word}{' '}
        <span className="muted">· {t.team ?? t.rig}</span>
      </button>
      <button type="button" className="toast-x" aria-label={`Dismiss ${t.name} ${s.word}`} onClick={() => onDismiss(t.id)}>
        <Icon name="x" size={14} />
      </button>
    </li>
  );
}

export function Toasts({ toasts, onOpen, onDismiss }: { toasts: Toast[]; onOpen: (t: Toast) => void; onDismiss: (id: number) => void }) {
  return (
    <section className="toasts" aria-label="Notifications" aria-live="polite">
      <ul>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onOpen={onOpen} onDismiss={onDismiss} />
        ))}
      </ul>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { KEYMAP } from '../keys';
import { Btn, Icon } from './ui';

/** `?`: the full keymap with a filter. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, []);
  const rows = KEYMAP.filter((k) => `${k.keys} ${k.what} ${k.where}`.toLowerCase().includes(q.toLowerCase().trim()));
  const wheres = [...new Set(rows.map((r) => r.where))];
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="help panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keys"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="panel-bar">
          <span className="panel-title">
            <Icon name="keyboard" size={16} /> Keyboard shortcuts
          </span>
          <span className="panel-rule" aria-hidden="true" />
          <Btn variant="ghost" icon="x" iconOnly onClick={onClose} aria-label="Close" kbd="esc" />
        </div>
        <div className="palette-input">
          <span className="prompt" aria-hidden="true">
            <Icon name="search" size={16} />
          </span>
          <input ref={input} aria-label="Filter keys" placeholder="filter keys" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} />
        </div>
        <div className="help-body">
          {rows.length === 0 && <p className="muted pad">No keys match.</p>}
          {wheres.map((w) => (
            <section key={w} aria-label={w} className="help-sec">
              <h3>{w}</h3>
              <dl>
                {rows
                  .filter((r) => r.where === w)
                  .map((r) => (
                    <div key={`${r.keys}-${r.what}`} className="help-row">
                      <dt>
                        <kbd>{r.keys}</kbd>
                      </dt>
                      <dd>{r.what}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

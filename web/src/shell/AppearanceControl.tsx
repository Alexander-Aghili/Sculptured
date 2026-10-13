import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, FONTS, applyAppearance, readAppearance, saveAppearance, type Appearance } from '../appearance';
import { Btn } from './ui';

export function AppearanceControl() {
  const [value, setValue] = useState(readAppearance);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const update = (patch: Partial<Appearance>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveAppearance(next);
  };
  useEffect(() => {
    applyAppearance(value);
  }, [value]);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === APPEARANCE_KEY || e.key === null) setValue(readAppearance()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (open) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);
  return <>
    <Btn ref={trigger} variant="ghost" className="appearance-trigger" aria-label="Appearance" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} tip="Font, text size and surfaces">
      <span aria-hidden="true">Aa</span>
    </Btn>
    {open && createPortal(
      <div className="overlay appearance-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
        <div className="panel appearance-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="appearance-title" onKeyDown={e => {
          // Keep app-wide navigation and execution shortcuts out of this dialog.
          if (e.key !== 'Tab') e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); close(); }
          if (e.key === 'Tab') {
            const controls = [...dialog.current!.querySelectorAll<HTMLElement>('*')].filter(el => el.matches('button, select, input') && !el.hasAttribute('disabled'));
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }}>
          <div className="panel-bar"><h2 id="appearance-title" className="panel-title">Appearance</h2><span className="panel-rule" /><Btn variant="ghost" icon="x" iconOnly aria-label="Close appearance" onClick={close} /></div>
          <div className="appearance-body">
            <p className="muted">Make this workspace comfortable to read.</p>
            <label className="appearance-field">Interface font<select value={value.font} onChange={e => update({ font: e.target.value as Appearance['font'] })}>{Object.entries(FONTS).map(([id, font]) => <option key={id} value={id}>{font.label}</option>)}</select></label>
            <div className="appearance-field"><label htmlFor="text-size">Text size <output htmlFor="text-size">{value.size} px</output></label><div className="appearance-size"><Btn aria-label="Smaller text" disabled={value.size === 12} onClick={() => update({ size: value.size - 1 })}>A−</Btn><input id="text-size" type="range" min="12" max="16" step="1" value={value.size} onChange={e => update({ size: Number(e.target.value) })} /><Btn aria-label="Larger text" disabled={value.size === 16} onClick={() => update({ size: value.size + 1 })}>A+</Btn></div><span className="muted appearance-hint">Compact to large. Code stays in a monospace font.</span></div>
            <label className="appearance-switch"><input type="checkbox" checked={value.glass} onChange={e => update({ glass: e.target.checked })} /><span>Translucent surfaces<small>Turn off for a solid, quieter workspace.</small></span></label>
            <div className="appearance-sample"><span className="eyebrow">Preview</span><strong>Source & chapter converter</strong><p>Waiting for Chapter designer to finish.</p><code>src/components/Workspace.tsx</code></div>
            <p className="appearance-hint muted">Saved in this browser. Your system’s reduced transparency setting takes priority.</p>
          </div>
          <div className="appearance-foot"><Btn variant="ghost" onClick={() => update(DEFAULT_APPEARANCE)}>Reset defaults</Btn><Btn variant="primary" onClick={close}>Done</Btn></div>
        </div>
      </div>, document.body)}
  </>;
}

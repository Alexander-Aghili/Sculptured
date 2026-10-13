import { useEffect, useState, type ReactNode } from 'react';

/** Text past either limit is long: it starts folded behind "Show more". */
export type FoldLimit = { chars: number; lines: number };
export const TRANSCRIPT_FOLD: FoldLimit = { chars: 1200, lines: 14 };

export function isLong(text: string, limit: FoldLimit = TRANSCRIPT_FOLD): boolean {
  if (text.length > limit.chars) return true;
  return text.split('\n').filter((l) => l.trim()).length > limit.lines;
}

/** Open or folded. `force` (a search hit, a jump to it) opens it; it then stays open until you fold it. */
export function useFold(force = false) {
  const [open, setOpen] = useState(force);
  useEffect(() => {
    if (force) setOpen(true);
  }, [force]);
  return { open, toggle: () => setOpen((v) => !v) };
}

export function FoldToggle({ open, onToggle, className = '' }: { open: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" className={`fold-toggle link-btn ${className}`} aria-expanded={open} onClick={onToggle}>
      {open ? 'Show less' : 'Show more'}
    </button>
  );
}

/** Long content folded to a few lines, with "Show more" under it. Short content is left as is. */
export function Fold({ text, force = false, children }: { text: string; force?: boolean; children: ReactNode }) {
  const { open, toggle } = useFold(force);
  if (!isLong(text)) return <>{children}</>;
  return (
    <div className="fold" data-open={open}>
      <div className="fold-body">{children}</div>
      <FoldToggle open={open} onToggle={toggle} />
    </div>
  );
}

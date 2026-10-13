import type { Diagnostic } from '../generated/Diagnostic';
import { SEVERITY_LABEL } from '../status';
import { plural } from '../format';

/** More notes than this start collapsed. */
export const SPEC_NOTES_OPEN_MAX = 3;

/** Warnings and not-enforced declarations from the compiled spec, as text. */
export function specNotes(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'warning' || d.severity === 'not-enforced');
}

export function SpecNoteList({ notes }: { notes: Diagnostic[] }) {
  return (
    <ul aria-label="Spec notes">
      {notes.map((d, i) => (
        <li key={`${i}-${d.path}`}>
          <span className={`severity sev-${d.severity}`}>{SEVERITY_LABEL[d.severity]}</span> · <code data-advanced>{d.path}</code> — {d.message}
        </li>
      ))}
    </ul>
  );
}

/** The rig header's spec notes. Collapsed (a keyboard-operable disclosure) above three. */
export function SpecNotes({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const notes = specNotes(diagnostics);
  if (notes.length === 0) return null;
  const warnings = notes.filter((d) => d.severity === 'warning').length;
  const notEnforced = notes.length - warnings;
  const parts = [
    warnings > 0 ? plural(warnings, 'warning') : null,
    notEnforced > 0 ? `${notEnforced} declared · not enforced` : null,
  ].filter(Boolean);
  return (
    <details className="spec-notes" open={notes.length <= SPEC_NOTES_OPEN_MAX}>
      <summary>Spec notes: {parts.join(', ')}</summary>
      <SpecNoteList notes={notes} />
    </details>
  );
}

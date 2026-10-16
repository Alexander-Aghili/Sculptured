import type { FolderEntry } from '../generated/FolderEntry';

/** A folder's files with a tick each; `files` is absent when the computer's runner cannot list them. */
export function FileList({ files, chosen, onToggle }: { files: FolderEntry[] | undefined; chosen: string[]; onToggle: (path: string, on: boolean) => void }) {
  if (files === undefined) {
    return <p className="fp-note tone-amber" role="status">This computer's runner cannot list files yet. Reinstall it from Computers, then try again.</p>;
  }
  return (
    <ul className="folder-list file-list" aria-label="Files">
      {files.length === 0 && <li className="muted fp-empty">No files here.</li>}
      {files.map((f) => (
        <li key={f.path}>
          <label className="folder-row file-row">
            <input type="checkbox" checked={chosen.includes(f.path)} onChange={(e) => onToggle(f.path, e.target.checked)} />
            <span className="fp-name">{f.name}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The Input's text with each path on a line of its own after it. */
export function withFiles(text: string, paths: string[]): string {
  return [text.trimEnd(), ...paths].filter(Boolean).join('\n');
}

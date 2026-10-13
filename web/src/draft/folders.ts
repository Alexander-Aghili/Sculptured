import type { TeamDraft } from '../generated/TeamDraft';
import type { DraftAgent } from '../generated/DraftAgent';
export const effectiveFolder = (d: TeamDraft, a: DraftAgent) => a.folder?.trim() || d.folder?.trim() || null;
export const setProjectFolder = (d: TeamDraft, folder: string | null): TeamDraft => ({ ...d, folder: folder || undefined });
/** `folder` becomes the project folder, and every agent uses it (their own folders are cleared). */
export const folderForAll = (d: TeamDraft, folder: string): TeamDraft => inheritProjectFolder(setProjectFolder(d, folder));
export const inheritProjectFolder = (d: TeamDraft): TeamDraft => d.folder
  ? { ...d, agents: d.agents.map(a => ({ ...a, folder: null })) }
  : d;

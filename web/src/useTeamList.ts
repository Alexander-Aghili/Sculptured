import { errorText } from './errors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { TeamDraft } from './generated/TeamDraft';
import type { TeamSummary } from './generated/TeamSummary';
import { useMounted, usePolling } from './usePolling';
import { TEAM_LIST_REFRESH_MS } from './useTeams';

/**
 * Team drafts (built in the Structure board), refreshed with the team list. Each draft is
 * re-read only when its `updated_at_ms` changes. Running state is never taken from here: it
 * comes from each team's live stream.
 */
export function useTeamList() {
  const [summaries, setSummaries] = useState<TeamSummary[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TeamDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const loadedAt = useRef(new Map<string, number>());
  const live = useMounted();

  const load = useCallback(async () => {
    try {
      const list = await api.listTeams();
      if (!live.current) return;
      const ok = Array.isArray(list) ? list : [];
      setSummaries(ok);
      setError(null);
      const want = new Set(ok.map((s) => s.id));
      setDrafts((cur) => keepOnly(cur, want));
      readChangedDrafts(ok, loadedAt.current, (id, draft) => live.current && setDrafts((cur) => ({ ...cur, [id]: draft })));
    } catch (e) {
      if (live.current) setError(errorText(e));
    }
  }, [live]);

  usePolling(load, TEAM_LIST_REFRESH_MS);
  useEffect(() => {
    window.addEventListener('projects-changed', load);
    return () => window.removeEventListener('projects-changed', load);
  }, [load]);

  return { summaries, drafts, error, reload: load };
}

/** Re-reads each listed team whose draft changed since it was last read. */
function readChangedDrafts(list: TeamSummary[], loadedAt: Map<string, number>, onDraft: (id: string, draft: TeamDraft) => void) {
  for (const s of list) {
    if (loadedAt.get(s.id) === s.updated_at_ms) continue;
    loadedAt.set(s.id, s.updated_at_ms);
    api
      .getTeam(s.id)
      .then((rec) => rec?.draft && onDraft(s.id, rec.draft))
      .catch(() => loadedAt.delete(s.id));
  }
}

/** The drafts whose team is still listed; the same object when none went away. */
function keepOnly(cur: Record<string, TeamDraft>, want: Set<string>): Record<string, TeamDraft> {
  const gone = Object.keys(cur).filter((id) => !want.has(id));
  if (gone.length === 0) return cur;
  const next = { ...cur };
  for (const id of gone) delete next[id];
  return next;
}

import { useState } from 'react';
import { api, ApiError, type AssistantTurn, type DesignProposal } from '../../api';
import { errorText } from '../../errors';

export type Cli = 'claude' | 'codex';
export const CLI_NAME: Record<Cli, string> = { claude: 'Claude Code', codex: 'Codex' };

/** How the last proposal ended, said once in the panel. */
export type Outcome = 'approved' | 'rejected' | null;

type Talk = {
  turns: AssistantTurn[];
  proposal: DesignProposal | null;
  /** The saved design's revision when the conversation started. */
  baseRevision: number | null;
  busy: boolean;
  /** When the current request started (ms since the epoch), while busy. */
  since: number | null;
  error: string;
  outcome: Outcome;
};

const QUIET: Talk = { turns: [], proposal: null, baseRevision: null, busy: false, since: null, error: '', outcome: null };

/** Why a request failed, in words that say what to do next (never "reload": the conversation would go). */
function failure(e: unknown, cli: Cli): string {
  if (e instanceof ApiError && e.status === 504) {
    return `${CLI_NAME[cli]} took longer than Sculptured waits (about 10 minutes). Try a smaller change, or ask for it in steps; your message is back in the box.`;
  }
  return errorText(e);
}

/** One request: the person's turn, then the proposal (or the error, and the turn taken back). */
async function askOnce(teamId: string, cli: Cli, talk: Talk, text: string, revision: number, set: (f: (t: Talk) => Talk) => void): Promise<boolean> {
  const turns: AssistantTurn[] = [...talk.turns, { role: 'person', text }];
  set((t) => ({ ...t, turns, busy: true, since: Date.now(), error: '', outcome: null }));
  try {
    const p = await api.designAssistant(teamId, { options: { cli, model: null }, messages: turns, proposal: talk.proposal?.madl ?? null });
    const said: AssistantTurn = { role: 'assistant', text: p.summary || 'Here is the proposal.' };
    set((t) => ({ ...t, turns: [...turns, said], proposal: p, baseRevision: t.baseRevision ?? revision, busy: false, since: null }));
    return true;
  } catch (e) {
    set((t) => ({ ...t, turns: talk.turns, busy: false, since: null, error: failure(e, cli) }));
    return false;
  }
}

/**
 * A conversation with the person's own CLI about the design. Each answer is a proposal: the saved
 * design does not change until it is approved; rejecting drops it, so the design is as it was.
 */
export function useDesignAssistant(teamId: string) {
  const [open, setOpen] = useState(false);
  const [cli, setCli] = useState<Cli>('claude');
  const [talk, setTalk] = useState<Talk>(QUIET);
  const ask = (text: string, revision: number) => askOnce(teamId, cli, talk, text, revision, setTalk);
  const end = (outcome: Outcome) => setTalk({ ...QUIET, outcome });
  return { open, setOpen, cli, setCli, ...talk, ask, end };
}

export type DesignAssistantState = ReturnType<typeof useDesignAssistant>;

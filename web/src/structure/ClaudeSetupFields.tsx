import type { ClaudeSetup } from '../generated/ClaudeSetup';
import type { TeamDraft } from '../generated/TeamDraft';
import type { Edit } from './Panels';

export const DEFAULT_SETUP: ClaudeSetup = { global: false, project: true };

/** The draft with its Claude setup changed; the default is not written. */
export function withSetup(d: TeamDraft, patch: Partial<ClaudeSetup>): TeamDraft {
  const next = { ...DEFAULT_SETUP, ...(d.claude_setup ?? {}), ...patch };
  const { claude_setup: _old, ...rest } = d;
  return next.global === DEFAULT_SETUP.global && next.project === DEFAULT_SETUP.project ? rest : { ...rest, claude_setup: next };
}

const NOTE = 'Your own Claude Code setup loads into every agent and is re-read on every model call. '
  + 'Sculptured’s own agent tools load either way. Takes effect the next time an agent starts.';

/** Which of the person's own Claude Code setup the team's Claude agents load. */
export function ClaudeSetupFields({ draft, edit, locked }: { draft: TeamDraft; edit: Edit; locked: boolean }) {
  const s = { ...DEFAULT_SETUP, ...(draft.claude_setup ?? {}) };
  const set = (patch: Partial<ClaudeSetup>) => edit((d) => withSetup(d, patch), 'claude-setup');
  return (
    <fieldset className="ta-limits">
      <legend className="fld-label">Claude Code setup for agents</legend>
      <label className="ta-check">
        <input id="claude-setup-global" type="checkbox" checked={s.global} disabled={locked} onChange={(e) => set({ global: e.target.checked })} />
        <span><b>Global plugins and settings</b><span className="fld-meta">Your ~/.claude: plugins, skills, hooks, settings and MCP servers.</span></span>
      </label>
      <label className="ta-check">
        <input id="claude-setup-project" type="checkbox" checked={s.project} disabled={locked} onChange={(e) => set({ project: e.target.checked })} />
        <span><b>Project plugins and settings</b><span className="fld-meta">The agent folder’s .claude: its settings, plugins and skills.</span></span>
      </label>
      <p className="fld-meta">{NOTE}</p>
    </fieldset>
  );
}

import type { TeamDraft } from '../generated/TeamDraft';
import type { TeamLimits } from '../generated/TeamLimits';
import type { Edit } from './Panels';

const FIELDS: { key: keyof TeamLimits; label: string }[] = [
  { key: 'max_agents', label: 'Most agents, children included' },
  { key: 'max_child_levels', label: 'Most levels of children' },
];

/** The draft with one limit set, or removed when blank (no limits at all drops `limits`). */
export function withLimit(d: TeamDraft, key: keyof TeamLimits, value: number | null): TeamDraft {
  const limits: TeamLimits = { ...d.limits };
  if (value === null) delete limits[key];
  else limits[key] = value;
  const { limits: _old, ...rest } = d;
  return Object.keys(limits).length === 0 ? rest : { ...rest, limits };
}

const parse = (text: string) => (text.trim() === '' ? null : Math.max(0, Math.floor(Number(text) || 0)));

/** A team's own limits on the agents its agents spawn. Blank = no limit; Sculptured sets none. */
export function TeamLimitsFields({ draft, edit, locked }: { draft: TeamDraft; edit: Edit; locked: boolean }) {
  return (
    <fieldset className="ta-limits">
      <legend className="fld-label">Limits on spawned agents</legend>
      {FIELDS.map((f) => (
        <label key={f.key} className="ta-limit">
          <span>{f.label}</span>
          <input className="fld-input" type="number" min={0} placeholder="no limit" aria-label={f.label} disabled={locked}
            value={draft.limits?.[f.key] ?? ''} onChange={(e) => edit((d) => withLimit(d, f.key, parse(e.target.value)), `limit:${f.key}`)} />
        </label>
      ))}
      <p className="fld-meta">
        Sculptured sets no limits of its own. When a limit here is reached, the agent is told so and the Run board shows it.
      </p>
    </fieldset>
  );
}

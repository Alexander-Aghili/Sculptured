import type { DraftAgent } from '../generated/DraftAgent';
import type { TeamDraft } from '../generated/TeamDraft';
import { setAdvanced } from '../draft/edits';
import type { Edit } from './Panels';

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

type DataKey = 'reads' | 'writes' | 'side_effects';
const DATA: { key: DataKey; label: string; hint: string }[] = [
  { key: 'reads', label: 'Reads', hint: 'Files and folders it reads, one per line, relative to its folder. Empty: anything.' },
  { key: 'writes', label: 'Writes', hint: 'Files and folders it changes. Protections refuse its Read, Write and Edit calls outside these; shell commands are not checked.' },
  { key: 'side_effects', label: 'Other effects', hint: 'Effects beyond its files, in plain words: “sends email”, “pushes to main”.' },
];

/** The agent's contract (MADL `data_access` and `authority`): what it touches and what it decides. */
export function ContractFields({ draft, agent, edit, locked }: { draft: TeamDraft; agent: DraftAgent; edit: Edit; locked: boolean }) {
  const data = agent.advanced.data_access ?? {};
  const setData = (key: DataKey, text: string) => edit((d: TeamDraft) => {
    const next = { ...data, [key]: lines(text) };
    const empty = !next.reads?.length && !next.writes?.length && !next.side_effects?.length && !next.rationale;
    return setAdvanced(d, agent.id, { data_access: empty ? undefined : next });
  }, `contract:${agent.id}:${key}`);
  const setDomains = (text: string) => edit((d: TeamDraft) => {
    const domains = lines(text);
    return setAdvanced(d, agent.id, { authority: domains.length ? { ...agent.advanced.authority, domains } : undefined });
  }, `contract:${agent.id}:domains`);
  const setScope = (scope: string) => edit((d: TeamDraft) => setAdvanced(d, agent.id, { authority: { domains: agent.advanced.authority?.domains ?? [], ...agent.advanced.authority, scope: scope || undefined } }), `contract:${agent.id}:scope`);
  const id = (k: string) => `contract-${agent.id}-${k}`;
  return (
    <fieldset className="fld-contract">
      <legend className="fld-label">Contract</legend>
      {DATA.map((f) => (
        <label key={f.key} htmlFor={id(f.key)} className="fld">
          <span>{f.label}</span>
          <textarea id={id(f.key)} className="fld-input mono" rows={2} disabled={locked} value={(data[f.key] ?? []).join('\n')} onChange={(e) => setData(f.key, e.target.value)} />
          <span className="fld-hint muted">{f.hint}</span>
        </label>
      ))}
      <label htmlFor={id('domains')} className="fld">
        <span>Decides</span>
        <textarea id={id('domains')} className="fld-input" rows={2} disabled={locked} value={(agent.advanced.authority?.domains ?? []).join('\n')} onChange={(e) => setDomains(e.target.value)} />
        <span className="fld-hint muted">Decisions this agent owns, one per line. Every agent is told who decides what, and asks the owner first.</span>
      </label>
      <label htmlFor={id('scope')} className="fld">
        <span>Its decisions reach</span>
        <select id={id('scope')} className="fld-input" disabled={locked || !agent.advanced.authority?.domains.length} value={agent.advanced.authority?.scope ?? ''} onChange={(e) => setScope(e.target.value)}>
          <option value="">its own work</option>
          {draft.groups.map((g) => <option key={g.id} value={g.id}>across the {g.label.trim() || 'unnamed'} group</option>)}
          <option value="system">across the whole team</option>
        </select>
        <span className="fld-hint muted">A decision belongs to the agent whose reach contains its consequences: others take cross-group decisions to it instead of agreeing them between themselves.</span>
      </label>
    </fieldset>
  );
}

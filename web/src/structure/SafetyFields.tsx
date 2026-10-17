import { useState } from 'react';
import type { SafetyRule } from '../generated/SafetyRule';
import type { TeamDraft } from '../generated/TeamDraft';
import { Btn } from '../shell/ui';
import type { Edit } from './Panels';
import PRESETS from './safety-presets.json';
import './safety.css';

const EMPTY = { name: '', tool_pattern: '.*', conditions: '', reason: '' };

/** Your own rule: name, which tools, conditions (one per line, in Signet-Eval's format) and the reason. */
function RuleForm({ onAdd, onCancel }: { onAdd: (r: SafetyRule) => void; onCancel: () => void }) {
  const [r, setR] = useState(EMPTY);
  const lines = r.conditions.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="safety-form">
      <label className="fld"><span>Name</span><input className="fld-input mono" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
      <label className="fld"><span>Tools (a regular expression)</span><input className="fld-input mono" value={r.tool_pattern} onChange={(e) => setR({ ...r, tool_pattern: e.target.value })} /></label>
      <label className="fld"><span>Conditions, one per line, all must hold</span>
        <textarea className="fld-input mono" rows={3} placeholder="contains(parameters, 'DROP TABLE')" value={r.conditions} onChange={(e) => setR({ ...r, conditions: e.target.value })} /></label>
      <label className="fld"><span>What the agent is told</span><input className="fld-input" value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} /></label>
      <div className="fld-actions">
        <Btn size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn size="sm" variant="primary" disabled={!r.name.trim()} onClick={() => onAdd({ name: r.name.trim(), tool_pattern: r.tool_pattern.trim() || '.*', conditions: lines, reason: r.reason.trim() || undefined })}>Add rule</Btn>
      </div>
      <p className="fld-hint muted">Functions: contains, any_of, matches, param_contains, param_eq, param_ne, not, or. <code>parameters</code> is the whole call; a field such as <code>file_path</code> or <code>command</code> is one part. A rule that cannot be read is shown as a problem and never blocks.</p>
    </div>
  );
}

/** The team's safety rules: tool calls they match are refused, for every Claude agent with protections on. */
export function SafetyFields({ draft, edit, locked }: { draft: TeamDraft; edit: Edit; locked: boolean }) {
  const rules = draft.safety ?? [];
  const [adding, setAdding] = useState(false);
  const set = (next: SafetyRule[]) => edit((d: TeamDraft) => ({ ...d, safety: next.length ? next : undefined }), 'safety');
  const unused = (PRESETS as SafetyRule[]).filter((p) => !rules.some((r) => r.name === p.name));
  return (
    <fieldset className="fld-safety">
      <legend className="fld-label">Safety rules</legend>
      {rules.length === 0 ? <p className="fld-hint muted">None. Add a ready-made rule or your own; a matching tool call is refused with its reason.</p> : (
        <ul className="skill-list">
          {rules.map((r, i) => (
            <li key={r.name}>
              <span><code>{r.name}</code> <span className="muted">{r.reason ?? r.conditions.join(' and ')}</span></span>
              <Btn size="sm" disabled={locked} aria-label={`Remove safety rule ${r.name}`} onClick={() => set(rules.filter((_, j) => j !== i))}>Remove</Btn>
            </li>
          ))}
        </ul>
      )}
      <div className="fld-actions">
        <select className="fld-input" aria-label="Add a ready-made safety rule" value="" disabled={locked || unused.length === 0}
          onChange={(e) => { const p = unused.find((u) => u.name === e.target.value); if (p) set([...rules, p]); }}>
          <option value="">Add a ready-made rule…</option>
          {unused.map((p) => <option key={p.name} value={p.name}>{p.reason}</option>)}
        </select>
        <Btn size="sm" disabled={locked} onClick={() => setAdding(true)}>Add your own</Btn>
      </div>
      {adding && <RuleForm onAdd={(r) => { set([...rules, r]); setAdding(false); }} onCancel={() => setAdding(false)} />}
    </fieldset>
  );
}

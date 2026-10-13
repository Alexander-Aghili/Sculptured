import {DismissibleError} from '../shell/DismissibleError';
import { useState } from 'react';
import type { WorkflowTask } from '../generated/WorkflowTask';
import type { WorkflowRun } from '../generated/WorkflowRun';
import type { TopicMode } from '../generated/TopicMode';
import { api } from '../api';
import { errorText } from '../errors';

export function TopicExecution({ task, run, active }: { task: WorkflowTask; run: WorkflowRun; active: boolean }) {
  const [mode, setMode] = useState<TopicMode>(task.input.mode ?? 'independent');
  const [deps, setDeps] = useState(task.input.depends_on ?? []);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const editable = active && task.status === 'queued' && !task.assignment && task.history.length === 0;
  const waiting = (task.input.depends_on ?? []).filter(id => run.tasks.find(t => t.input.id === id)?.status !== 'complete');
  const save = async () => { setSaving(true); try {
    await api.topicExecution(run.rig, { task:task.input.id, start_seq:run.start_seq, mode, depends_on:mode === 'independent' ? [] : deps,
      previous_mode:task.input.mode ?? 'independent', previous_depends_on:task.input.depends_on ?? [] }); setError('');
  } catch (e) { setError(errorText(e)); } finally { setSaving(false); } };
  return <section aria-label={`Execution for ${task.input.title}`}>
    <p>{task.input.mode === 'dependent' ? `Dependent · prerequisites: ${(task.input.depends_on ?? []).join(', ')}` : 'Independent · can run alongside unrelated topics when a worker is available.'}</p>
    {waiting.length > 0 && <p role="status">Waiting for accepted results: {waiting.join(', ')}. Blocked prerequisites keep this topic waiting.</p>}
    <fieldset disabled={!editable || saving}><legend>Topic execution</legend>
      <label><input type="radio" name={`mode-${task.input.id}`} checked={mode === 'independent'} onChange={() => setMode('independent')} /> Independent</label>
      <label><input type="radio" name={`mode-${task.input.id}`} checked={mode === 'dependent'} onChange={() => setMode('dependent')} /> Dependent</label>
      {mode === 'dependent' && <fieldset><legend>Wait for topics</legend>{run.tasks.filter(t => t.input.id !== task.input.id).map(t => <label key={t.input.id}><input type="checkbox" checked={deps.includes(t.input.id)} onChange={e => setDeps(e.target.checked ? [...deps,t.input.id] : deps.filter(id => id !== t.input.id))} />{t.input.title}</label>)}</fieldset>}
      <button className="btn" disabled={mode === 'dependent' && !deps.length} onClick={() => void save()}>Save topic execution</button>
    </fieldset>
    {!editable && <small>Execution can only change before this topic receives its first assignment.</small>}{error && <DismissibleError>{error}</DismissibleError>}
  </section>;
}

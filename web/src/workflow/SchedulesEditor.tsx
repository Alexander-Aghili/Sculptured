import type { Schedule } from '../generated/Schedule';
import { api } from '../api';
import { usePolled } from '../usePolling';
import type { TeamDraft } from '../generated/TeamDraft';

/** Messages a team sends an agent every N minutes while it runs (busy agents are skipped). At most 8. */
export function SchedulesEditor({ draft, locked, editTeam }: { draft: TeamDraft; locked: boolean; editTeam: (fn: (d: TeamDraft) => TeamDraft) => void }) {
  const list = draft.schedules ?? [];
  // What each schedule actually did lately: sent, not delivered, or skipped and why.
  const runs = usePolled(() => (list.length ? api.scheduleRuns(draft.id) : Promise.resolve([])), 30000, [draft.id, list.length > 0]).data ?? [];
  const set = (next: Schedule[]) => editTeam((d) => ({ ...d, schedules: next.length ? next : undefined }));
  const change = (id: string, patch: Partial<Schedule>) => set(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const add = () => { let n = 1; while (list.some((s) => s.id === `schedule-${n}`)) n++; set([...list, { id: `schedule-${n}`, agent: (draft.agents.find((a) => a.id !== draft.workflow?.dispatcher && a.id !== draft.workflow?.collector) ?? draft.agents[0])?.id ?? '', every_minutes: 30, message: '' }]); };
  return <fieldset className="schedules-editor" disabled={locked}><legend>Schedules</legend>
    {list.map((s) => <div key={s.id} className="schedule-row">
      <label>Agent for {s.id} <select value={s.agent} onChange={(e) => change(s.id, { agent: e.target.value })}>{draft.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Every (minutes) for {s.id} <input type="number" min={5} max={1440} value={s.every_minutes} onChange={(e) => change(s.id, { every_minutes: Number(e.target.value) })} /></label>
      <label>Message for {s.id} <textarea maxLength={4096} value={s.message} onChange={(e) => change(s.id, { message: e.target.value })} /></label>
      <button className="link-btn" onClick={() => set(list.filter((x) => x.id !== s.id))}>Remove {s.id}</button>
      {runs.some((r) => r.schedule === s.id) && <ul className="schedule-runs" aria-label={`Recent runs of ${s.id}`}>
        {runs.filter((r) => r.schedule === s.id).slice(0, 3).map((r) => <li key={`${r.at_ms}-${r.outcome}`}>{new Date(r.at_ms).toLocaleString()} · {r.outcome}</li>)}
      </ul>}
    </div>)}
    <button className="btn" disabled={list.length >= 8} onClick={add}>Add schedule</button>
  </fieldset>;
}

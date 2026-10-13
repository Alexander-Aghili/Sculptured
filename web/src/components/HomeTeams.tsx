import { Link } from 'react-router-dom';
import type { RigSummary } from '../generated/RigSummary';
import type { TeamSummary } from '../generated/TeamSummary';
import { plural } from '../format';
import { byActivity } from '../useTeams';

/** Teams built here, most recently changed first. */
export function BuiltTeams({ built }: { built: TeamSummary[] }) {
  return (
    <section aria-label="Teams built here">
      <h2 className="sub-title">Teams</h2>
      <ul className="home-teams">
        {[...built]
          .sort((a, b) => b.updated_at_ms - a.updated_at_ms)
          .map((t) => (
            <li key={t.id}>
              <BuiltTeam t={t} />
            </li>
          ))}
      </ul>
    </section>
  );
}

function BuiltTeam({ t }: { t: TeamSummary }) {
  return (
    <Link to={t.started ? `/rig/${encodeURIComponent(t.id)}` : `/team/${encodeURIComponent(t.id)}/structure`} className="home-team">
      <span className="home-team-name">{t.name}</span>
      <span className="muted">{t.started ? `${t.started.running_count}/${t.started.seat_count} running` : `not started · ${plural(t.agent_count, 'agent')}`}</span>
      {t.started && t.started.attention_count > 0 && <span className="tone-red">◉ {t.started.attention_count} need attention</span>}
    </Link>
  );
}

/** Teams started from a file, most active first. */
export function FileTeams({ rigs, titled }: { rigs: RigSummary[]; titled: boolean }) {
  return (
    <section aria-label="Started from a file">
      {titled && <h2 className="sub-title">Started from a file</h2>}
      <ul className="home-teams">
        {byActivity(rigs).map((r) => (
          <li key={r.name}>
            <Link to={`/rig/${encodeURIComponent(r.name)}`} className="home-team">
              <span className="home-team-name">{r.name}</span>
              <span className="muted">
                {r.running_count}/{r.seat_count} running
              </span>
              {r.attention_count > 0 && <span className="tone-red">◉ {r.attention_count} need attention</span>}
              <span className="muted">{r.desired === 'running' ? 'set to run' : 'set to stop'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

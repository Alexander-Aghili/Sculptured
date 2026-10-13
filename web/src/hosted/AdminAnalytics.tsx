import { useEffect, useId, useState } from 'react';
import { gw } from './session';
import './hosted.css';

type Day = { day: string; active_users: number; seconds_total: number; seconds_median: number };
type Overview = { days: Day[]; active_week: number; funnel: Record<'invited' | 'joined' | 'computer' | 'first_team' | 'first_run' | 'week2', number> };
type Person = { id: string; name: string; email: string; joined: string; last_active: string | null; seconds_week: number; teams: number; runs: number; tokens: number; devices: number };
type Event = { id: number; at: string; source: string; name: string; props: Record<string, unknown> };
type Feature = { name: string; events: number; users: number; share: number };
type Setups = { agents: { n: number; teams: number }[]; models: { n: number; teams: number }[]; runtimes: { runtime: string; teams: number }[]; uses: Record<'arrows' | 'checks' | 'copies' | 'token_limits' | 'workflow' | 'of', number> };
type Errors = { day: string; api_5xx: number; failed_checks: number; failed_starts: number }[];

const TABS = ['Overview', 'People', 'Features', 'Setups', 'Errors'] as const;
type Tab = (typeof TABS)[number];
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');
const minutes = (s: number) => Math.round(s / 60);
const ONE: Record<string, string> = { people: 'person', minutes: 'minute', errors: 'error', checks: 'check', starts: 'start' };

/**
 * Vertical bars over days, one series in one hue (validated on the panel surface), with the same
 * numbers as a table below. Each bar has a tooltip with its day and value.
 */
function DayBars({ title, rows, value, unit }: { title: string; rows: { day: string }[]; value: (r: never) => number; unit: string }) {
  const ids = useId();
  const values = rows.map((r) => value(r as never));
  const max = Math.max(1, ...values);
  const W = 640;
  const H = 140;
  const gap = 2;
  const bw = Math.max(2, (W - gap * (rows.length - 1)) / Math.max(1, rows.length));
  return (
    <figure className="an-chart" aria-labelledby={`${ids}-t`}>
      <figcaption>
        <span id={`${ids}-t`}>{title}</span> <span className="muted">· up to {max} {max === 1 ? (ONE[unit] ?? unit) : unit}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}: highest ${max} ${unit}`}>
        <line x1={0} x2={W} y1={H} y2={H} className="an-axis" />
        {rows.map((r, i) => {
          const h = (values[i] / max) * (H - 8);
          return (
            <g key={r.day}>
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={Math.max(h, values[i] > 0 ? 2 : 0)} rx={Math.min(4, bw / 2)} className="an-bar">
                <title>{`${r.day}: ${values[i]} ${unit}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="an-ticks" aria-hidden="true">
        <span>{rows[0]?.day}</span>
        <span>{rows.at(-1)?.day}</span>
      </div>
      <details className="an-table">
        <summary>Table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.day}>
                <td>{r.day}</td>
                <td>{values[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** A labelled horizontal bar per row: the bar shows the share, the text says the numbers. */
function BarList({ label, rows }: { label: string; rows: { key: string; name: string; share: number; text: string }[] }) {
  return (
    <ul className="an-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key}>
          <span className="an-name">{r.name}</span>
          <span className="an-track" aria-hidden="true">
            <span className="an-fill" style={{ width: `${Math.max(0, Math.min(1, r.share)) * 100}%` }} />
          </span>
          <span className="an-num">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function useData<T>(path: string): [T | null, string] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    gw<T>('GET', path).then((d) => live && setData(d), (e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [path]);
  return [data, error];
}

function OverviewTab() {
  const [o, error] = useData<Overview>('/admin/analytics/overview?days=30');
  if (error) return <p role="alert" className="tone-red">{error}</p>;
  if (!o) return <p role="status">Loading…</p>;
  const f = o.funnel;
  return (
    <>
      <p className="an-headline">
        <strong>{o.active_week}</strong> active this week · <strong>{minutes(o.days.reduce((t, d) => t + d.seconds_total, 0))}</strong>{' '}
        {minutes(o.days.reduce((t, d) => t + d.seconds_total, 0)) === 1 ? 'minute' : 'minutes'} in 30 days
      </p>
      <DayBars title="Active users per day" rows={o.days} value={(d: Day) => d.active_users} unit="people" />
      <div className="an-multiples">
        <DayBars title="Minutes per day (everyone)" rows={o.days} value={(d: Day) => minutes(d.seconds_total)} unit="minutes" />
        <DayBars title="Minutes per day (median person)" rows={o.days} value={(d: Day) => minutes(d.seconds_median)} unit="minutes" />
      </div>
      <h3>From invite to returning</h3>
      <BarList
        label="From invite to returning"
        rows={[
          { key: 'invited', name: 'Invited', share: 1, text: `${f.invited}` },
          { key: 'joined', name: 'Joined', share: f.invited ? f.joined / f.invited : 0, text: `${f.joined} · ${pct(f.joined, f.invited)} of invited` },
          // Each bar is the same share its text states.
          { key: 'computer', name: 'Connected a computer', share: f.joined ? f.computer / f.joined : 0, text: `${f.computer} · ${pct(f.computer, f.joined)} of joined` },
          { key: 'team', name: 'Made a team', share: f.joined ? f.first_team / f.joined : 0, text: `${f.first_team} · ${pct(f.first_team, f.joined)} of joined` },
          { key: 'run', name: 'Ran a team', share: f.joined ? f.first_run / f.joined : 0, text: `${f.first_run} · ${pct(f.first_run, f.joined)} of joined` },
          { key: 'week2', name: 'Came back in week 2', share: f.joined ? f.week2 / f.joined : 0, text: `${f.week2} · ${pct(f.week2, f.joined)} of joined` },
        ]}
      />
    </>
  );
}

function Timeline({ person }: { person: Person }) {
  const [events, error] = useData<Event[]>(`/admin/analytics/users/${person.id}/timeline`);
  if (error) return <p role="alert" className="tone-red">{error}</p>;
  if (!events) return <p role="status">Loading…</p>;
  return (
    <ol className="an-timeline" aria-label={`${person.name}’s timeline`}>
      {events.map((e) => (
        <li key={e.id}>
          <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time> <span className="muted">{e.source}</span> <strong>{e.name}</strong>{' '}
          <span className="muted">
            {Object.entries(e.props)
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PeopleTab() {
  const [people, error] = useData<Person[]>('/admin/analytics/users');
  const [open, setOpen] = useState<Person | null>(null);
  if (error) return <p role="alert" className="tone-red">{error}</p>;
  if (!people) return <p role="status">Loading…</p>;
  return (
    <>
      <table aria-label="People">
        <thead>
          <tr>
            <th>Name</th>
            <th>Joined</th>
            <th>Last active</th>
            <th>Minutes this week</th>
            <th>Teams</th>
            <th>Runs</th>
            <th>Tokens</th>
            <th>Computers</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>
                <button className="btn-link" aria-pressed={open?.id === p.id} onClick={() => setOpen(open?.id === p.id ? null : p)}>
                  {p.name}
                </button>{' '}
                <span className="muted">{p.email}</span>
              </td>
              <td>{new Date(p.joined).toLocaleDateString()}</td>
              <td>{p.last_active ? new Date(p.last_active).toLocaleString() : '—'}</td>
              <td>{minutes(p.seconds_week)}</td>
              <td>{p.teams}</td>
              <td>{p.runs}</td>
              <td>{p.tokens.toLocaleString()}</td>
              <td>{p.devices}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <Timeline key={open.id} person={open} />}
    </>
  );
}

function FeaturesTab() {
  const [features, error] = useData<Feature[]>('/admin/analytics/features?days=30');
  if (error) return <p role="alert" className="tone-red">{error}</p>;
  if (!features) return <p role="status">Loading…</p>;
  return (
    <BarList
      label="Feature use"
      rows={features.map((f) => ({ key: f.name, name: f.name, share: f.share, text: `${f.users} ${f.users === 1 ? 'person' : 'people'} · ${pct(f.share, 1)}` }))}
    />
  );
}

function SetupsTab() {
  const [s, error] = useData<Setups>('/admin/analytics/setups?days=30');
  if (error) return <p role="alert" className="tone-red">{error}</p>;
  if (!s) return <p role="status">Loading…</p>;
  const most = Math.max(1, ...s.agents.map((a) => a.teams));
  const runtimeMost = Math.max(1, ...s.runtimes.map((r) => r.teams));
  const u = s.uses;
  return (
    <>
      <h3>Agents per started team</h3>
      <BarList label="Agents per started team" rows={s.agents.map((a) => ({ key: `${a.n}`, name: `${a.n} agent${a.n === 1 ? '' : 's'}`, share: a.teams / most, text: `${a.teams} start${a.teams === 1 ? '' : 's'}` }))} />
      <h3>Models per started team</h3>
      <BarList
        label="Models per started team"
        rows={s.models.map((m) => ({ key: `${m.n}`, name: m.n === 0 ? 'CLI default' : `${m.n} model${m.n === 1 ? '' : 's'} chosen`, share: m.teams / Math.max(1, ...s.models.map((x) => x.teams)), text: `${m.teams} start${m.teams === 1 ? '' : 's'}` }))}
      />
      <h3>Programs</h3>
      <BarList label="Programs" rows={s.runtimes.map((r) => ({ key: r.runtime, name: r.runtime, share: r.teams / runtimeMost, text: `${r.teams} start${r.teams === 1 ? '' : 's'}` }))} />
      <h3>What teams use</h3>
      <BarList
        label="What teams use"
        rows={(
          [
            ['arrows', 'Arrows'],
            ['checks', 'Checks'],
            ['copies', "Agents' own copies"],
            ['token_limits', 'Token limits'],
            ['workflow', 'Workflows'],
          ] as const
        ).map(([k, name]) => ({ key: k, name, share: u.of ? u[k] / u.of : 0, text: `${u[k]} of ${u.of} · ${pct(u[k], u.of)}` }))}
      />
    </>
  );
}

function ErrorsTab() {
  const [rows, error] = useData<Errors>('/admin/analytics/errors?days=30');
  if (error) return <p role="alert" className="tone-red">{error}</p>;
  if (!rows) return <p role="status">Loading…</p>;
  return (
    <>
      <DayBars title="Server errors (5xx) per day" rows={rows} value={(r: Errors[number]) => r.api_5xx} unit="errors" />
      <DayBars title="Failed starts per day" rows={rows} value={(r: Errors[number]) => r.failed_starts} unit="starts" />
      <DayBars title="Failed checks per day" rows={rows} value={(r: Errors[number]) => r.failed_checks} unit="checks" />
    </>
  );
}

/** The beta's analytics for admins: activity, the funnel, people, features, setups, errors. */
export function AdminAnalytics() {
  const [tab, setTab] = useState<Tab>('Overview');
  return (
    <section className="an" aria-label="Analytics">
      <div role="tablist" aria-label="Analytics views" className="an-tabs">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && <OverviewTab />}
        {tab === 'People' && <PeopleTab />}
        {tab === 'Features' && <FeaturesTab />}
        {tab === 'Setups' && <SetupsTab />}
        {tab === 'Errors' && <ErrorsTab />}
      </div>
    </section>
  );
}

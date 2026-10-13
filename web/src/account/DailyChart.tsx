import { useState } from 'react';
import { compactNumber } from '../format';
import type { DayTokens } from '../generated/DayTokens';

export const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const W = 600, H = 140, GAP = 2;

/** Tokens per day for the last 30 days as bars, one series (so no legend), with a table of the same numbers. */
export function DailyChart({ days }: { days: DayTokens[] }) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const bw = W / days.length;
  return (
    <figure className="acct-chart">
      <svg viewBox={`0 0 ${W} ${H + 1}`} role="img" aria-label={`Tokens per day, last ${days.length} days`}>
        <line x1={0} y1={H} x2={W} y2={H} className="acct-axis" />
        {days.map((d, i) => {
          const h = d.tokens ? Math.max(3, (d.tokens / max) * (H - 8)) : 0;
          return (
            <rect key={d.day} data-day={d.day} x={i * bw + GAP / 2} y={H - h} width={bw - GAP} height={h} rx={h > 4 ? 3 : 0} className="acct-bar" tabIndex={d.tokens ? 0 : -1}>
              <title>{`${dayLabel(d.day)}: ${compactNumber(d.tokens)} tokens`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="acct-ticks" aria-hidden="true"><span>{dayLabel(days[0].day)}</span><span>{dayLabel(days[days.length - 1].day)}</span></div>
      <figcaption>
        <button type="button" className="link-btn" aria-expanded={table} onClick={() => setTable(!table)}>{table ? 'Hide the table' : 'Show as a table'}</button>
      </figcaption>
      {table && <DayTable days={days} />}
    </figure>
  );
}

function DayTable({ days }: { days: DayTokens[] }) {
  return (
    <table aria-label="Tokens per day" className="acct-table">
      <thead><tr><th>Day</th><th>Tokens</th></tr></thead>
      <tbody>{days.map((d) => <tr key={d.day}><td>{dayLabel(d.day)}</td><td>{d.tokens.toLocaleString()}</td></tr>)}</tbody>
    </table>
  );
}

import {DismissibleError} from '../shell/DismissibleError';
import type { EventRecord } from '../generated/EventRecord';
import { GAP_NOTICE, useSeatEvents } from '../useSeatEvents';

export function EventsTab({ seatId, feed, epoch }: { seatId: string; feed: EventRecord[]; epoch: number }) {
  const { events, loading, error, truncated, gap } = useSeatEvents(seatId, feed, epoch);
  return (
    <div className="inspector-body">
      {loading && <p role="status">Loading events…</p>}
      {error && <DismissibleError>Could not load events: {error}</DismissibleError>}
      {truncated && <p className="notice">Older events not loaded.</p>}
      {gap && <p className="notice">{GAP_NOTICE}</p>}
      <table className="events-table" data-raw-evidence aria-label="Raw events">
        <thead>
          <tr>
            <th scope="col">seq</th>
            <th scope="col">type</th>
            <th scope="col">actor</th>
            <th scope="col">provenance</th>
            <th scope="col">data</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <EventRow key={e.seq} e={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({ e }: { e: EventRecord }) {
  return (
    <tr>
      <td>{e.seq}</td>
      <td>{e.body.type}</td>
      <td>
        {e.actor.kind}:{e.actor.id}
      </td>
      <td>{e.provenance}</td>
      <td>
        <details>
          <summary>JSON</summary>
          <pre>{JSON.stringify(e, null, 2)}</pre>
        </details>
      </td>
    </tr>
  );
}

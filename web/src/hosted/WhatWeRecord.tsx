import { BackToApp } from './BackToApp';
import { RECORDED_EVENTS } from './analytics';
import { RECORDED } from './session';
import './hosted.css';

/** The beta's disclosure: everything recorded, and what never is. */
export function WhatWeRecord() {
  return (
    <main className="hosted-page hosted-record">
      <BackToApp />
      <h1>What we record</h1>
      <p>{RECORDED}</p>
      <p>
        <strong>Never recorded:</strong> prompts, messages, jobs, agent output, team or agent names, folder names or paths, file contents, check commands.
      </p>
      <table aria-label="Everything recorded">
        <thead>
          <tr>
            <th>Event</th>
            <th>From</th>
            <th>What it says</th>
          </tr>
        </thead>
        <tbody>
          {RECORDED_EVENTS.map((e) => (
            <tr key={e.name}>
              <td>
                <code>{e.name}</code>
              </td>
              <td>{e.from}</td>
              <td>{e.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Kept for 180 days, then only daily totals remain. Sculptured running on your own computer, outside the beta, records nothing. Every event is checked against this list
        before it is stored; anything else is refused.
      </p>
    </main>
  );
}

import { Link } from 'react-router-dom';
import { STATES, type Counts } from '../herdr';
import { Btn, Icon } from './ui';
import { AppearanceControl } from './AppearanceControl';
import { BrandMark } from './BrandMark';

function clock(now: number): string {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The open team's stream: following it live, or trying to reconnect. */
export type Connection = 'live' | 'reconnecting';

export function StatusLine({
  team,
  counts,
  now,
  onGoto,
  onHelp,
  connection,
}: {
  team?: string;
  counts: Counts;
  now: number;
  onGoto: () => void;
  onHelp: () => void;
  connection?: Connection;
}) {
  const needs = counts['needs-you'];
  return (
    <header className="statusline">
      <Link to="/?all" className="brand">
        <BrandMark />
        Sculptured
      </Link>
      {team && (
        <>
          <span className="sl-crumb" aria-hidden="true">
            <Icon name="chevron-right" size={14} />
          </span>
          <span className="sl-team">{team}</span>
        </>
      )}
      <span className="sl-spacer" />
      <span className="sl-counts" aria-label="All teams">
        <span className={`sl-count tone-vendor${counts.working ? '' : ' muted'}`}>
          <span className={`glyph${counts.working ? ' spin' : ''}`} aria-hidden="true">
            {STATES.working.glyph}
          </span>{' '}
          {counts.working} working
        </span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span className={`sl-count st-needs-you ${needs ? 'tone-red' : 'muted'}`} data-testid="needs-you-count">
          <span className="glyph" aria-hidden="true">
            {STATES['needs-you'].glyph}
          </span>{' '}
          {needs} needs you
        </span>
        {counts.failed > 0 && (
          <>
            <span className="sep" aria-hidden="true">
              ·
            </span>
            <span className="sl-count tone-red">
              <span aria-hidden="true">{STATES.failed.glyph}</span> {counts.failed} failed
            </span>
          </>
        )}
        {counts.done > 0 && (
          <>
            <span className="sep" aria-hidden="true">
              ·
            </span>
            <span className="sl-count tone-green st-done" data-tip={STATES.done.tip}>
              <span aria-hidden="true">{STATES.done.glyph}</span> {counts.done} done
            </span>
          </>
        )}
      </span>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      {connection === 'live' && (
        <span className="sl-live">
          <span className="dot" aria-hidden="true" /> live
        </span>
      )}
      {connection === 'reconnecting' && (
        <span className="sl-live tone-amber">
          <span className="dot" aria-hidden="true" /> reconnecting
        </span>
      )}
      <time className="sl-clock">{clock(now)}</time>
      <Btn className="sl-btn sl-search" icon="search" onClick={onGoto} aria-label="Go to agent" tip="Go to an agent" kbd="g · Ctrl+K">
        <span className="sl-search-text">Go to agent…</span>
        <kbd aria-hidden="true">g</kbd>
      </Btn>
      <AppearanceControl />
      <Btn className="sl-btn" variant="ghost" icon="keyboard" iconOnly onClick={onHelp} aria-label="Keys" tip="Keyboard shortcuts" kbd="?" />
    </header>
  );
}

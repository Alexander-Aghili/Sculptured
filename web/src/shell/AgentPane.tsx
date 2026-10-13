import { SignInNeeded } from './SignInNeeded';
import { OpenQuestions } from './OpenQuestions';
import { useCallback, useId, useRef, useState, type RefObject } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { VisualProgress } from '../visual/VisualProgress';
import type { EventRecord } from '../generated/EventRecord';
import { tierOf } from '../herdr';
import { ACTIVITY, LIFECYCLE, turnStateView } from '../status';
import { WORDS } from '../vocab';
import { EventsTab } from '../components/EventsTab';
import { AgentActions, Composer, useAgentControls, type AgentControls } from './AgentControls';
import { agentPath, type AgentRow } from './model';
import { Transcript } from './Transcript';
import { shortPath, useHome } from '../structure/FolderPicker';
import { Btn, Icon, StateMark, VendorMark, WaitingMark } from './ui';
import { HandoffActions } from './HandoffActions';
import { StallNotice } from './StallNotice';
import { CheckDetails } from './CheckMark';
import { useSeatEvents } from '../useSeatEvents';
import { ChatTextMode } from './ChatTextMode';

/**
 * The agent's state once, in plain words, following turnStateView: activity, turn and tool are
 * current only while running, last known while stale, and not shown otherwise.
 */
function Detail({ a }: { a: AgentRow }) {
  const seat = a.seat!;
  const view = turnStateView(seat.lifecycle);
  const act = ACTIVITY[seat.activity].label;
  const tool = seat.current_tool ? seat.current_tool.toLowerCase() : null;
  let text: string;
  if (view === 'not-running') text = `${LIFECYCLE[seat.lifecycle].label} · not running`;
  else {
    const parts = [view === 'last-known' ? `last known: ${act}` : act, seat.current_turn ? 'turn in progress' : 'no turn in progress'];
    if (tool) parts.push(`tool ${tool}`);
    text = parts.join(' · ');
  }
  return <p className="pane-detail">{text}</p>;
}

/**
 * Above the message box of a first agent with no Job (`AgentRow.firstMessageIsWork`): the next
 * message is its work. Hidden once it has read a message in its current session (a start, or a
 * restart, begins a new one): that message was its work, and the next is not.
 */
function FirstMessageHint({ seatId, feed, epoch }: { seatId: string; feed: EventRecord[]; epoch: number }) {
  const { events } = useSeatEvents(seatId, feed, epoch);
  let readThisSession = false;
  for (const e of events) {
    if (e.body.type === 'tenure-started') readThisSession = false;
    else if (e.body.type === 'message-consumed') readThisSession = true;
  }
  if (readThisSession) return null;
  return (
    <p className="composer-hint" role="note">
      <Icon name="message" size={13} className="muted" /> {WORDS.firstMessageIsWork}
    </p>
  );
}

type Props = {
  a: AgentRow;
  tab: string;
  feed: EventRecord[];
  epoch: number;
  onBack: () => void;
  controlsRef?: RefObject<AgentControls | null>;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
  /** Changes each time the person chose "Answer": the agent's first open question takes the focus. */
  answerToken?: number;
};

/** The agent pane replaces the board: header, transcript or raw events, composer. */
export function AgentPane({ a, tab, feed, epoch, onBack, controlsRef, composerRef, answerToken }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const seat = a.seat!;
  const c = useAgentControls(seat, headingRef);
  if (controlsRef) controlsRef.current = c;
  const current = tab === 'events' ? 'events' : tab === 'visual' ? 'visual' : 'conversation';
  // Visual progress opens a point in the Transcript (`?item=`); back returns to the picture.
  const location = useLocation();
  const navigate = useNavigate();
  const focusKey = current === 'conversation' ? new URLSearchParams(location.search).get('item') : null;
  const fromVisual = (location.state as { from?: string } | null)?.from === 'visual';
  const showInTranscript = useCallback(
    (key: string) => navigate(`${agentPath(a.rig, a.id, 'conversation')}?item=${encodeURIComponent(key)}`, { state: { from: 'visual' } }),
    [navigate, a.rig, a.id],
  );
  const backToVisual = useCallback(() => navigate(-1), [navigate]);
  const reason = seat.lifecycle_reason;
  const prov = tierOf(seat.lifecycle_provenance);
  const home = useHome();
  return (
    <ChatTextMode className={`agent-pane ${a.vendor.cls} st-${a.state.key}`} name={a.name}
      onOpen={() => { if (current !== 'conversation') navigate(agentPath(a.rig, a.id, 'conversation')); }}>
      <header className="pane-head">
        <div className="pane-row">
          <Btn className="back" variant="ghost" icon="arrow-left" iconOnly onClick={onBack} aria-label={`Back to ${a.rig}`} kbd="esc" tip="Back to the team" />
          <VendorMark v={a.vendor} size="lg" />
          <span className="pane-who">
            <span className={`vendor-name ${a.vendor.cls}`}>{a.vendor.name}</span>
            <h2 ref={headingRef} tabIndex={-1} className="pane-name">
              {a.name}
            </h2>
          </span>
          <StateMark state={a.state} className="pane-state" pill />
          <nav className="tabs" aria-label="Agent views">
            <Link to={agentPath(a.rig, a.id, 'conversation')} aria-current={current === 'conversation' ? 'page' : undefined}>
              Transcript
            </Link>
            <Link to={agentPath(a.rig, a.id, 'visual')} aria-current={current === 'visual' ? 'page' : undefined}>
              Visual progress
            </Link>
            <Link to={agentPath(a.rig, a.id, 'events')} aria-current={current === 'events' ? 'page' : undefined}>
              Events
            </Link>
            <span className="tabs-rule" aria-hidden="true" />
          </nav>
          <span className="pane-spacer" />
          <button type="button" className="pane-details-toggle" aria-label="Details & controls" title="Details & controls" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(open => !open)}>
            <Icon name="more" size={16} />
          </button>
        </div>
        <div id={detailsId} className="pane-secondary" hidden={!detailsOpen} data-open={detailsOpen}>
          <AgentActions c={c} name={a.name} />
          <CheckDetails seat={seat.id} check={seat.check} />
          <div className="pane-meta">
            <span className="folder" title={a.folder}>
              <Icon name="folder" size={13} className="muted" />
              {a.folder === '~' ? '~ (home folder)' : shortPath(a.folder, home)}
            </span>
            <span className="sep">·</span>
            <span>{WORDS.session(seat.tenure)}</span>
            <span className="sep">·</span>
            <span>{seat.tokens_in === null || seat.tokens_out === null ? 'tokens unknown' : `${seat.tokens_in} in / ${seat.tokens_out} out tokens`}</span>
            <span className="sep">·</span>
            <span title={`Evidence for the latest status change: ${seat.lifecycle_provenance ?? 'unknown'}`}>
              status{' '}
              <span className={`tier-inline tier-${prov.word}`}>
                <span aria-hidden="true">{prov.glyph}</span> {prov.word}
              </span>
            </span>
            <details className="internal-id" data-advanced>
              <summary>{WORDS.advanced}</summary>
              <span>
                {WORDS.internalId}: <code>{seat.id}</code>
              </span>
            </details>
          </div>
          <Detail a={a} />
        </div>
        <HandoffActions key={seat.id} a={a} />
        <SignInNeeded a={a} feed={feed} />
        <OpenQuestions key={`q-${seat.id}`} seat={seat.id} name={a.name} feed={feed} focusToken={answerToken} />
        <StallNotice seat={seat} />
        {a.waitingFor && a.waitingFor.length > 0 && !a.stuck && (
          <p className="pane-waiting">
            <WaitingMark names={a.waitingFor} />
            <span className="muted">
              {' — '}
              {a.waitingFor.length > 1
                ? 'starts when they have all finished; their results are passed along'
                : `starts when ${a.waitingFor[0]} finishes; ${a.waitingFor[0]}'s result is passed along`}
            </span>
          </p>
        )}
        {reason && (
          <p className={`reason full-reason${['attention', 'failed'].includes(seat.lifecycle) ? ' tone-red' : ''}`}>
            Reason: <span data-raw-evidence>{reason}</span>
          </p>
        )}
   </header>
      <div className="pane-body">
        {current === 'events' ? (
          <EventsTab key={seat.id} seatId={seat.id} feed={feed} epoch={epoch} />
        ) : current === 'visual' ? (
          <VisualProgress key={seat.id} seatId={seat.id} feed={feed} epoch={epoch} state={a.state} onJump={showInTranscript} />
        ) : (
          <Transcript
            key={seat.id}
            seatId={seat.id}
            feed={feed}
            epoch={epoch}
            vendor={a.vendor}
            name={a.name}
            focusKey={focusKey}
            onReturn={fromVisual ? backToVisual : undefined}
            returnLabel="Visual progress"
          />
        )}
      </div>
      {a.firstMessageIsWork && !seat.current_turn && <FirstMessageHint seatId={seat.id} feed={feed} epoch={epoch} />}
      <Composer key={seat.id} c={c} inputRef={composerRef} />
    </ChatTextMode>
  );
}

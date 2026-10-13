import { nameForId } from '../vocab';
import { needsAttention } from '../status';
import type { CompiledRig } from '../generated/CompiledRig';
import { shortAge, tokensText } from '../herdr';
import { edgeSentence, WORDS, type NameMap } from '../vocab';
import type { AgentRow } from './model';
import { Icon, StateMark, VendorMark } from './ui';
import { CheckMark } from './CheckMark';
import { shortPath, useHome } from '../structure/FolderPicker';

/** Text fallback for the graph: the same agents and states, connections as sentences. */
export function AgentList({
  observedLabels,
  compiled,
  agents,
  names = {},
  selected,
  onOpen,
  now,
  connections = true,
}: {
  observedLabels?:Record<string,string>;
  compiled: CompiledRig;
  agents: Record<string, AgentRow>;
  names?: NameMap;
  selected?: string;
  onOpen: (id: string) => void;
  now: number;
  /** The connections section (Run leaves it out; Design shows the arrows). */
  connections?: boolean;
}) {
  const home = useHome();
  // The folder is noise when every agent works in the same one.
  const oneFolder = new Set(Object.values(agents).map((a) => a.folder)).size <= 1;
  return (
    <div className="agent-list">
      {compiled.pods.map((p) => (
        <section key={p.id} aria-label={WORDS.groupRegion(p.label)} className="list-group">
          <h2 className="list-head">
            <Icon name="group" size={13} />
            {p.label}
          </h2>
          <ul>
            {compiled.seats
              .filter((s) => s.pod === p.id)
              .map((s) => {
                const a = agents[s.id];
                if (!a) return null;
                const seat = a.seat;
                const reason = seat && needsAttention(seat.lifecycle) ? seat.lifecycle_reason : null;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`list-row ${a.vendor.cls} tone-row-${a.state.tone}${selected === s.id ? ' selected' : ''}`}
                      aria-label={seat ? `${a.name} — ${a.state.word}` : WORDS.unknownAgent(a.name)}
                      data-agent={s.id}
                      onClick={() => onOpen(s.id)}
                    >
                      <span className="lr-line">
                        <StateMark state={a.state} pill />
                        <VendorMark v={a.vendor} />
                        <span className="lr-name">{a.name}</span>
                        {seat?.check && <CheckMark check={seat.check} />}
                        <span className="lr-meta">
                          {a.state.key === 'working' && seat?.current_tool ? `${seat.current_tool.toLowerCase()} · ` : ''}
                          {tokensText(seat)} · {shortAge(a.lastMs, now)}
                        </span>
                      </span>
                      {!oneFolder && <span className="lr-folder mono">{a.folder === '~' ? '~ (home folder)' : shortPath(a.folder, home)}</span>}
                      {reason && (
                        <span className="lr-reason reason" data-raw-evidence>
                          {reason}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {connections && (
      <section aria-label={WORDS.connections} className="list-group">
        <h2 className="list-head">
          <Icon name="arrow-right" size={13} />
          {WORDS.connections}
        </h2>
        {compiled.edges.length === 0 ? (
          <p className="muted pad">{WORDS.noConnections}</p>
        ) : (
          <ul className="connections">
            {compiled.edges.map((e) => (
              <li key={`${e.kind}-${e.from}-${e.to}`}>
                <Icon name="arrow-right" size={13} className="muted" />
                {observedLabels ? `${nameForId(e.from,names)} → ${nameForId(e.to,names)} · ${e.kind === 'spawned_by' ? 'subagent' : observedLabels[`${e.from}→${e.to}`]??'Observed link'}` : edgeSentence(e, names)}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}

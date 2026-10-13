import { Link } from 'react-router-dom';
import { agentPath, type AgentRow, type TeamRow } from './model';
import { LIBRARY_SECTIONS, type LibrarySection } from './LibraryPage';
import { StateMark } from './ui';

const COLLECTION_CONTEXT = {
  groups: {title:'Reusable groups',text:'Local group designs with their agents, instructions and internal connections. Inserted copies can change independently.'},
  systems: { title: 'The design', text: 'A system describes who does the work, how agents connect, and what each agent needs.' },
  runs: { title: 'The execution', text: 'A full run brings the design together with what actually happened, including outputs and evidence.' },
  publishing: { title: 'The release', text: 'Publishing will need a review of included files, conversations and access before anything is shared.' },
};

/** A read-only inspector using the same observed rows as the board. */
export function ContextPanel({ agent, team, library }: { agent?: AgentRow; team?: TeamRow; library?: LibrarySection }) {
  return (
    <aside id="workspace-details" className="panel context-panel" aria-label="Workspace details">
      <div className="panel-bar">
        <h2 className="panel-title">{library ? 'About this collection' : agent ? 'Agent details' : 'Workspace details'}</h2>
      </div>
      <div className="context-body">
        {library ? (
          <>
            <span className="eyebrow">Library / {LIBRARY_SECTIONS[library].name}</span>
            <h3>{COLLECTION_CONTEXT[library].title}</h3>
            <p className="muted">{COLLECTION_CONTEXT[library].text}</p>
            <div className="context-note">{library==='groups'?'Groups are saved locally, separately from projects.':'Planned area · nothing is saved or shared from this page.'}</div>
          </>
        ) : agent ? (
          <>
            <span className="eyebrow">{agent.vendor.name} · {agent.group}</span>
            <h3>{agent.name}</h3>
            <StateMark state={agent.state} pill />
            <dl>
              <dt>Current status</dt><dd>{agent.summary || 'Unknown'}</dd>
              <dt>Folder</dt><dd className="mono">{agent.folder || 'Unknown'}</dd>
              <dt>Hands work to</dt><dd>{agent.handsTo ? (agent.handsTo.join(', ') || 'No downstream agents') : 'Unknown'}</dd>
            </dl>
            {agent.seat?.lifecycle_reason && <p className="context-note" data-raw-evidence>{agent.seat.lifecycle_reason}</p>}
            <Link className="btn" to={agent.href ?? agentPath(agent.rig, agent.id)}>Open agent</Link>
            <p className="context-provenance">Status from the current team view. Completion of a turn is not independent verification.</p>
          </>
        ) : team ? (
          <>
            <span className="eyebrow">Current project</span>
            <h3>{team.title}</h3>
            <p className="muted">{team.agents.length} agents</p>
            <p className="context-note">Select an agent on the board to inspect its status and connections here.</p>
          </>
        ) : (
          <>
            <h3>Your workspace</h3>
            <p className="muted">Choose a project to design a team, follow its work, or inspect an agent.</p>
            <p className="context-note">Use Library to explore the planned areas for reusable systems and full runs.</p>
          </>
        )}
      </div>
    </aside>
  );
}

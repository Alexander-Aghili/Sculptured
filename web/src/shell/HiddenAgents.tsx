import { useState } from 'react';
import type { Box } from '../layout';
import type { AgentRow } from './model';

type Props = {
  /** Where it sits: the box of the first agent it stands for. */
  box: Box;
  ids: string[];
  /** "spawned by Planner" or "below Planner". */
  relation: string;
  kind: 'more' | 'deeper';
  agents: Record<string, AgentRow>;
  onOpen: (id: string) => void;
};

/** A "+N more" card (or "+N deeper" chip) for spawned agents the board does not draw; it lists them. */
export function HiddenAgents({ box, ids, relation, kind, agents, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const word = kind === 'more' ? 'more' : 'deeper';
  return (
    <div className={`hidden-agents hidden-${kind}`} style={{ left: box.x, top: box.y, width: box.w }}>
      <button type="button" className="btn hidden-agents-toggle" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={`+${ids.length} ${word} agents ${relation}`}>
        +{ids.length} {word}
      </button>
      {open && (
        <ul className="hidden-agents-list" aria-label={`Agents ${relation}, not drawn`}>
          {ids.map((id) => (
            <li key={id}>
              <button type="button" className="btn btn-sm" onClick={() => onOpen(id)}>
                {agents[id]?.name ?? id} · {agents[id]?.state.word ?? 'unknown'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

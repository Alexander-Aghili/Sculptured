import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { shortAge, type StateKey } from '../herdr';
import type { AgentRow, TeamRow } from './model';
import { Badge, Icon, StateMark, VendorMark } from './ui';

type Filter = 'blocked' | 'working' | 'idle' | 'done';
const FILTERS: { key: Filter; alt: string; label: string; match: (k: StateKey) => boolean }[] = [
  { key: 'blocked', alt: 'b', label: 'blocked', match: (k) => k === 'needs-you' || k === 'failed' },
  { key: 'working', alt: 'w', label: 'working', match: (k) => k === 'working' },
  { key: 'idle', alt: 'i', label: 'idle', match: (k) => k === 'idle' },
  { key: 'done', alt: 'd', label: 'done', match: (k) => k === 'done' },
];

/** Every whitespace-separated term must appear in the agent's name, team or folder. */
export function matches(a: AgentRow, query: string): boolean {
  const hay = `${a.name} ${a.rig} ${a.folder} ${a.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/** herdr's goto: one row per agent, grouped by team; type to search; Enter jumps. */
export function GotoPalette({
  teams,
  now,
  onJump,
  onClose,
}: {
  teams: TeamRow[];
  now: number;
  onJump: (a: AgentRow) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restore = useRef<Element | null>(null);

  useEffect(() => {
    restore.current = document.activeElement;
    input.current?.focus();
    return () => {
      const el = restore.current as HTMLElement | null;
      if (el && document.contains(el)) el.focus?.();
    };
  }, []);

  const groups = useMemo(() => {
    const active = FILTERS.filter((f) => filters.has(f.key));
    return teams
      .map((t) => ({
        rig: t.rig,
        agents: t.agents.filter((a) => matches(a, query) && (active.length === 0 || active.some((f) => f.match(a.state.key)))),
      }))
      .filter((g) => g.agents.length > 0);
  }, [teams, query, filters]);
  const flat = groups.flatMap((g) => g.agents);
  const sel = flat[Math.min(cursor, flat.length - 1)];

  useEffect(() => setCursor(0), [query, filters]);
  useEffect(() => {
    if (!sel) return;
    listRef.current?.querySelector(`[data-agent="${CSS.escape(sel.id)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [sel]);

  const toggle = (f: Filter) =>
    setFilters((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      // e.code: Alt+letter types a symbol on some layouts.
      const letter = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      const f = FILTERS.find((x) => x.alt === letter);
      if (f) {
        e.preventDefault();
        toggle(f.key);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel) onJump(sel);
    } else if (e.key === 'Tab') {
      // Keep focus in the dialog.
      e.preventDefault();
    }
  };

  const optionId = (a: AgentRow) => `${ids}-o-${a.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette panel" role="dialog" aria-modal="true" aria-label="Go to agent" onKeyDown={onKeyDown}>
        <div className="panel-bar">
          <span className="panel-title">Go to agent</span>
          <span className="panel-rule" aria-hidden="true" />
          <span className="panel-tools">
            <Badge>
              {flat.length} of {teams.reduce((n, t) => n + t.agents.length, 0)}
            </Badge>
          </span>
        </div>
        <div className="palette-input">
          <span className="prompt" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${ids}-list`}
            aria-activedescendant={sel ? optionId(sel) : undefined}
            aria-label="Search agents by name, team or folder"
            placeholder="search name, team or folder"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="palette-filters" role="group" aria-label="Filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="filter"
              aria-pressed={filters.has(f.key)}
              onClick={() => {
                toggle(f.key);
                input.current?.focus();
              }}
            >
              <kbd>alt+{f.alt}</kbd> {f.label}
            </button>
          ))}
        </div>
        <div className="palette-list" role="listbox" id={`${ids}-list`} aria-label="Agents" ref={listRef}>
          {groups.length === 0 && <p className="muted pad">No agents match.</p>}
          {groups.map((g) => (
            <div key={g.rig} role="group" aria-label={g.rig} className="palette-group">
              <div className="palette-team" aria-hidden="true">
                {g.rig}
              </div>
              {g.agents.map((a) => (
                <div
                  key={a.id}
                  id={optionId(a)}
                  role="option"
                  aria-selected={a === sel}
                  aria-label={`${a.name} — ${a.state.word}`}
                  data-agent={a.id}
                  className={`palette-row ${a.vendor.cls}${a === sel ? ' sel' : ''}`}
                  onMouseMove={() => setCursor(flat.indexOf(a))}
                  onClick={() => onJump(a)}
                >
                  <StateMark state={a.state} />
                  <VendorMark v={a.vendor} />
                  <span className="row-name">{a.name}</span>
                  <span className="row-group muted">{a.group}</span>
                  <span className="row-age">{shortAge(a.lastMs, now)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <Icon name="folder" size={14} className="muted" />
          <span className="sr-only">folder </span>
          <span className="palette-folder" data-testid="palette-folder">
            {sel ? sel.folder : '—'}
          </span>
          <span className="pane-spacer" />
          <span className="muted" aria-hidden="true">
            <kbd>↑↓</kbd> move <kbd>⏎</kbd> jump <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}


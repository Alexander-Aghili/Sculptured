import { useEffect, useRef, type ReactNode } from 'react';
import { Btn } from './ui';
import { Link } from 'react-router-dom';

export function WorkspaceBar({ library, workspaceHref, projectsShown, detailsShown, onProjects, onDetails, team, menuOpen, onMenu, needsAttention, children }: {
  team?: string; menuOpen: boolean; onMenu: () => void; needsAttention: number; children?: ReactNode;
  library: boolean; workspaceHref: string; projectsShown: boolean; detailsShown: boolean;
  onProjects: () => void; onDetails: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onMenu(); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen, onMenu]);
  return <div ref={root} className="workspace-menu-root" onKeyDown={e => {
    if (menuOpen && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onMenu(); trigger.current?.focus(); }
  }}>
    <Btn ref={trigger} className="workspace-menu-toggle" variant="ghost" icon="more" iconOnly tip="Workspace menu" aria-label="App menu" aria-controls="workspace-app-menu" aria-expanded={menuOpen} onClick={onMenu} />
    {needsAttention > 0 && !menuOpen && <span className="workspace-attention tone-red" role="status">{needsAttention} need attention</span>}
    <div id="workspace-app-menu" className="workspace-menu" hidden={!menuOpen}>
      <div className="workspace-bar">
        {team && <strong className="workspace-team">{team}</strong>}
        <nav className="workspace-nav" aria-label="Workspace navigation">
          <Link to={workspaceHref} aria-current={!library ? 'page' : undefined}>Workspace</Link>
          <Link to="/library/groups" aria-current={library ? 'page' : undefined}>Library</Link>
          <Link to="/community">Community</Link>
        </nav>

        <Btn variant="ghost" icon="panel-left" aria-label={`${projectsShown ? 'Hide' : 'Show'} projects panel`} aria-expanded={projectsShown} aria-controls="workspace-projects" onClick={onProjects}>Projects</Btn>
        <Btn variant="ghost" icon="panel-right" aria-label={`${detailsShown ? 'Hide' : 'Show'} details panel`} aria-expanded={detailsShown} aria-controls="workspace-details" onClick={onDetails}>Details</Btn>
      </div>
      {children}
    </div>
  </div>;
}

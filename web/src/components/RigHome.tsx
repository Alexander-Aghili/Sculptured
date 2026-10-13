import {DismissibleError} from '../shell/DismissibleError';
import { errorText } from '../errors';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { RigSummary } from '../generated/RigSummary';
import type { TeamSummary } from '../generated/TeamSummary';
import { byActivity } from '../useTeams';
import { BuiltTeams, FileTeams } from './HomeTeams';
import { StartFromFile } from './StartFromFile';

/** The rig list and the teams built here, each read once. */
function useHomeLists() {
  const [rigs, setRigs] = useState<RigSummary[] | null>(null);
  const [built, setBuilt] = useState<TeamSummary[]>([]);
  const [listError, setListError] = useState<Error | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.listRigs())
      .then((r) => live && setRigs(Array.isArray(r) ? r : []))
      .catch((e: Error) => live && setListError(e));
    // Teams built here; the rig list below keeps only those started from a file.
    Promise.resolve()
      .then(() => api.listTeams())
      .then((t) => live && Array.isArray(t) && setBuilt(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return { rigs, built, listError };
}

/**
 * `/`: goes straight to the most active team. With `?all`, or with no teams, it lists the
 * teams; under Advanced, an expert can start a team from a file.
 */
export function RigHome() {
  const { rigs, built, listError } = useHomeLists();
  const [params] = useSearchParams();
  const [trashed,setTrashed]=useState<Set<string>|null>(null);
  useEffect(()=>{let active=true;const load=()=>api.projectVisibility().then(v=>{if(active)setTrashed(new Set(v.filter(x=>x.status==='trashed').map(x=>x.id)));},()=>{if(active)setTrashed(new Set());});void load();window.addEventListener('project-visibility-changed',load);return()=>{active=false;window.removeEventListener('project-visibility-changed',load);};},[]);
  const visibleRigs=rigs?.filter(r=>!trashed?.has(r.name)),visibleBuilt=built.filter(t=>!trashed?.has(t.id));
  if (trashed && visibleRigs && visibleRigs.length > 0 && !params.has('all')) {
    return <Navigate to={`/rig/${encodeURIComponent(byActivity(visibleRigs)[0].name)}`} replace />;
  }
  const fileRigs = (visibleRigs ?? []).filter((r) => !built.some((t) => t.id === r.name));
  return (
    <section className="panel rig-home" aria-label="Teams">
      <div className="panel-bar">
        <span className="panel-title">Teams</span>
        <span className="panel-rule" aria-hidden="true" />
        <span className="panel-tools panel-count">{rigs ? fileRigs.length + visibleBuilt.length : ''}</span>
      </div>
      <div className="home-body">
        <ListStatus loading={rigs === null} error={listError} />
        {visibleBuilt.length > 0 && <BuiltTeams built={visibleBuilt} />}
        {visibleRigs?.length === 0 && visibleBuilt.length === 0 && <p className="muted">No projects yet. Make one with New project.</p>}
        {fileRigs.length > 0 && <FileTeams rigs={fileRigs} titled={visibleBuilt.length > 0} />}
        <StartFromFile />
      </div>
    </section>
  );
}

function ListStatus({ loading, error }: { loading: boolean; error: Error | null }) {
  if (error)
    return (
      <DismissibleError className="error tone-red">
        Could not load teams: {errorText(error)}
      </DismissibleError>
    );
  return loading ? (
    <p role="status" className="muted">
      Loading teams…
    </p>
  ) : null;
}

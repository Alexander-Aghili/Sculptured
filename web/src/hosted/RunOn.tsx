import { useEffect, useState } from 'react';
import { api } from '../api';
import type { TeamSettings } from '../generated/TeamSettings';
import { gw } from './session';
import type { Computer } from './ComputersPage';

/** Hosted: which of your computers runs this team. */
export function RunOn({ team }: { team: string }) {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { gw<Computer[]>('GET', '/devices').then(setComputers, () => {}); api.teamSettings(team).then(setSettings, () => {}); }, [team]);
  if (!settings) return null;
  const save = async (host: string) => { setError(''); try { setSettings(await api.saveTeamSettings(team, { ...settings, host: host || null })); } catch (e) { setError((e as Error).message); } };
  return (
    <div className="fld">
      <label className="fld-label" htmlFor={`run-on-${team}`}>Run on</label>
      <select id={`run-on-${team}`} className="fld-input" value={settings.host ?? ''} onChange={(e) => void save(e.target.value)}>
        <option value="">Automatic (your only connected computer)</option>
        {computers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.connected ? '' : ' (not connected)'}</option>)}
      </select>
      {computers.length === 0 && <p className="fld-hint">No computers connected yet. <a href="/computers">Connect one</a>.</p>}
      {error && <p className="tone-red" role="alert">{error}</p>}
    </div>
  );
}

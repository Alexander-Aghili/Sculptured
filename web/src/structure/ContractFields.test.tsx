import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { EditResult } from '../useTeamDraft';
import { teamDraft } from '../test-fixtures';
import { ContractFields } from './ContractFields';

function Harness() {
  const [d, setD] = useState<TeamDraft>(teamDraft({ id: 't', name: 'T' }));
  const edit = (f: (d: TeamDraft) => EditResult) => { const r = f(d); setD('draft' in r ? r.draft : r); return null; };
  const a = d.agents[0];
  return <><ContractFields draft={d} agent={a} edit={edit} locked={false} /><pre data-testid="c">{JSON.stringify({ data: a.advanced.data_access ?? null, auth: a.advanced.authority ?? null })}</pre></>;
}
const saved = () => JSON.parse(screen.getByTestId('c').textContent!);

describe('An agent’s contract', () => {
  it('keeps one path or domain per line, and clears to nothing when emptied', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: /Writes/ }), { target: { value: 'cad/wings/\n  \nassembly/notes.md' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Decides/ }), { target: { value: 'wing geometry' } });
    expect(saved()).toEqual({ data: { writes: ['cad/wings/', 'assembly/notes.md'] }, auth: { domains: ['wing geometry'] } });
    fireEvent.change(screen.getByRole('combobox', { name: /Its decisions reach/ }), { target: { value: 'system' } });
    expect(saved().auth).toEqual({ domains: ['wing geometry'], scope: 'system' });
    fireEvent.change(screen.getByRole('textbox', { name: /Writes/ }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Decides/ }), { target: { value: '' } });
    expect(saved()).toEqual({ data: null, auth: null });
  });
});

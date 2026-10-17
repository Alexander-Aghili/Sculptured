import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { EditResult } from '../useTeamDraft';
import { teamDraft } from '../test-fixtures';
import { ProtectionFields } from './ProtectionFields';

function Harness() {
  const [d, setD] = useState<TeamDraft>(teamDraft({ id: 't', name: 'T' }));
  const edit = (f: (d: TeamDraft) => EditResult) => { const r = f(d); setD('draft' in r ? r.draft : r); return null; };
  return <><ProtectionFields draft={d} edit={edit} locked={false} /><pre data-testid="p">{JSON.stringify(d.protection ?? null)}</pre></>;
}
const saved = () => JSON.parse(screen.getByTestId('p').textContent!);

describe('Protections', () => {
  it('are on with their defaults, write only a change, and say what applies to which agents', () => {
    render(<Harness />);
    expect(screen.getByRole('checkbox', { name: /Protections/ })).toBeChecked();
    expect(screen.getByRole('spinbutton', { name: /Refuse reading a whole file larger than/ })).toHaveValue(100);
    expect(screen.getByText(/Codex agents: the context limit only/)).toBeInTheDocument();
    expect(saved()).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton', { name: /Continue an agent fresh from its notes at/ }), { target: { value: '80000' } });
    expect(saved()).toEqual({ on: true, read_kb: 100, shell_chars: 8000, context_tokens: 80000 });
    fireEvent.click(screen.getByRole('checkbox', { name: /Protections/ }));
    expect(saved().on).toBe(false);
    expect(screen.getByRole('spinbutton', { name: /Refuse reading/ })).toBeDisabled();
  });
});

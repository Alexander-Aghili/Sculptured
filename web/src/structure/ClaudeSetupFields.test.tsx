import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { TeamDraft } from '../generated/TeamDraft';
import type { EditResult } from '../useTeamDraft';
import { teamDraft } from '../test-fixtures';
import { ClaudeSetupFields } from './ClaudeSetupFields';

function Harness() {
  const [d, setD] = useState<TeamDraft>(teamDraft({ id: 't', name: 'T' }));
  const edit = (f: (d: TeamDraft) => EditResult) => { const r = f(d); setD('draft' in r ? r.draft : r); return null; };
  return <><ClaudeSetupFields draft={d} edit={edit} locked={false} /><pre data-testid="setup">{JSON.stringify(d.claude_setup ?? null)}</pre></>;
}
const setup = () => JSON.parse(screen.getByTestId('setup').textContent!);

describe('Claude Code setup for agents', () => {
  it('starts with global off and project on, and writes only a change from that', () => {
    render(<Harness />);
    expect(screen.getByRole('checkbox', { name: /Global plugins and settings/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Project plugins and settings/ })).toBeChecked();
    expect(setup()).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Global plugins and settings/ }));
    expect(setup()).toEqual({ global: true, project: true });
    fireEvent.click(screen.getByRole('checkbox', { name: /Project plugins and settings/ }));
    expect(setup()).toEqual({ global: true, project: false });
    fireEvent.click(screen.getByRole('checkbox', { name: /Global plugins and settings/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Project plugins and settings/ }));
    expect(setup()).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { AgentAdvanced } from '../generated/AgentAdvanced';
import { TokenLimitField } from './TokenLimitField';

function Harness() {
  const [adv, setAdv] = useState<Partial<AgentAdvanced>>({});
  return <>
    <TokenLimitField value={adv.token_limit} turns={adv.turn_limit} minutes={adv.minute_limit} disabled={false} reason={null}
      onChange={(p) => setAdv({ ...adv, ...p })} />
    <pre data-testid="adv">{JSON.stringify(adv)}</pre>
  </>;
}
const adv = () => JSON.parse(screen.getByTestId('adv').textContent!);

describe('agent limits', () => {
  it('a hard token value alone sets the limit with the 85% soft default shown', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Tokens: hard (tokens)'), { target: { value: '20000' } });
    expect(adv().token_limit).toEqual({ tokens: 20000, counts: 'all', include_subagents: true });
    expect(screen.getByLabelText('Tokens: soft (tokens)')).toHaveAttribute('placeholder', '17000 (85%)');
    fireEvent.change(screen.getByLabelText('Tokens: soft (tokens)'), { target: { value: '10000' } });
    expect(adv().token_limit).toEqual({ tokens: 20000, soft: 10000, counts: 'all', include_subagents: true });
  });

  it('turn and time limits have their own soft and hard values, and clearing hard removes them', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Turns: hard (turns)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Minutes working: hard (minutes)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Minutes working: soft (minutes)'), { target: { value: '30' } });
    expect(adv()).toMatchObject({ turn_limit: { hard: 12 }, minute_limit: { soft: 30, hard: 45 } });
    fireEvent.change(screen.getByLabelText('Turns: hard (turns)'), { target: { value: '' } });
    expect(adv().turn_limit).toBeUndefined();
    expect(screen.getByLabelText('Turns: soft (turns)')).toBeDisabled();
  });
});

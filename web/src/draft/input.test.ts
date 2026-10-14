import { describe, expect, it } from 'vitest';
import { teamDraft } from '../test-fixtures';
import { removeElement } from './edits';
import { addInput, linkInput, moveInput, removeInput, setInputText, startingAgents, teamInputBox } from './input';

describe('the Input box', () => {
  it('is added clear of the cards, pointing to where the work starts', () => {
    const d = addInput(teamDraft());
    expect(startingAgents(teamDraft())).toEqual(['builder']);
    expect(d.input).toMatchObject({ text: '', to: ['builder'] });
    const box = teamInputBox(d)!;
    for (const a of d.agents) expect(box.x >= a.x + 200 || box.y >= a.y + 200 || box.x + box.w <= a.x || box.y + box.h <= a.y).toBe(true);
    expect(addInput(d)).toBe(d);
    expect(addInput({ ...teamDraft(), workflow: { input: '', dispatcher: '', collector: '', entry: '', max_tasks: 1, max_steps: 1, stages: [] } }).input).toBeUndefined();
  });

  it('moves, takes text, links and unlinks agents, and goes', () => {
    let d = addInput(teamDraft(), { x: 600, y: 400 });
    expect(teamInputBox(d)).toMatchObject({ x: 600, y: 400 });
    const onCard = moveInput(d, { x: 50, y: 50 }).input!;
    expect(onCard.x >= 240 || onCard.y >= 240).toBe(true);
    d = setInputText(moveInput(d, { x: 10.4, y: 620 }), 'Ship it');
    d = linkInput(linkInput(d, 'reviewer', true), 'builder', false);
    expect(d.input).toEqual({ text: 'Ship it', x: 10, y: 620, to: ['reviewer'] });
    expect(linkInput(d, 'nobody', true)).toBe(d);
    expect(removeElement(d, { kind: 'agent', id: 'reviewer' }).draft.input!.to).toEqual([]);
    expect('input' in removeInput(d)).toBe(false);
  });
});

import { expect, it } from 'vitest';
import { validateLessons, type Lesson } from './contract';
const lesson = (id: string, prerequisites: string[] = []): Lesson => ({id,title:id,chapter:'One',order:0,summary:'Learn this',objectives:['Understand'],prerequisites,sources:[{title:'Source',section:'1'}],revision:'r1',checks:['mathematical','interface'].map(kind=>({kind:kind as 'mathematical'|'interface',revision:'r1',evidence:'captured test result',status:'passed',reviewer:'checker'})),Content:()=>null});
it('rejects duplicate IDs, missing prerequisites, cycles and stale review evidence', () => {
  expect(validateLessons([lesson('a'), lesson('a')]).join()).toContain('duplicate');
  expect(validateLessons([lesson('a',['missing'])]).join()).toContain('invalid prerequisite');
  expect(validateLessons([lesson('a',['b']),lesson('b',['a'])]).join()).toContain('cycle');
  expect(validateLessons([{...lesson('a'),checks:[{kind:'mathematical',revision:'old',evidence:'log',status:'passed',reviewer:'checker'}]}]).join()).toContain('stale');
  expect(validateLessons([lesson('a'),lesson('b',['a'])])).toEqual([]);
});
it('requires current mathematical and interface acceptance with evidence', () => {
  expect(validateLessons([{...lesson('a'), checks:[]}]).join()).toContain('acceptance missing');
  expect(validateLessons([{...lesson('a'), checks:lesson('a').checks.map(c=>({...c,status:'failed'}))}]).join()).toContain('failed');
  expect(validateLessons([{...lesson('a'), checks:lesson('a').checks.map(c=>({...c,evidence:''}))}]).join()).toContain('acceptance missing');
});

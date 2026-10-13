import { describe, expect, it } from 'vitest';
import { checkOf, checkOutcome, editOf, lineDiff, toolKind, toolSummary } from './tools';

describe('toolKind', () => {
  it('sorts Claude and Codex tool names into kinds, and anything else into other', () => {
    expect(['Read', 'NotebookRead'].map(toolKind)).toEqual(['read', 'read']);
    expect(['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'apply_patch'].map(toolKind)).toEqual(['edit', 'edit', 'edit', 'edit', 'edit']);
    expect(['Bash', 'BashOutput', 'shell', 'exec_command'].map(toolKind)).toEqual(['bash', 'bash', 'bash', 'bash']);
    expect(['Grep', 'Glob', 'LS'].map(toolKind)).toEqual(['search', 'search', 'search']);
    expect(['WebFetch', 'WebSearch'].map(toolKind)).toEqual(['web', 'web']);
    expect(['Task', 'Agent'].map(toolKind)).toEqual(['task', 'task']);
    expect(['TodoWrite', 'mcp__x__y', ''].map(toolKind)).toEqual(['other', 'other', 'other']);
  });
});

describe('toolSummary', () => {
  it('names the path, command, pattern, address or task', () => {
    expect(toolSummary('Read', { file_path: '/w/src/a.ts' })).toBe('/w/src/a.ts');
    expect(toolSummary('Bash', { command: 'npm test', description: 'Run tests' })).toBe('npm test');
    expect(toolSummary('shell', { command: ['bash', '-lc', 'ls'] })).toBe('bash -lc ls');
    expect(toolSummary('Grep', { pattern: 'TODO', path: 'src' })).toBe('TODO in src');
    expect(toolSummary('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
    expect(toolSummary('WebFetch', { url: 'https://example.com', prompt: 'x' })).toBe('https://example.com');
    expect(toolSummary('WebSearch', { query: 'vitest docs' })).toBe('vitest docs');
    expect(toolSummary('Task', { description: 'list files', prompt: 'ls' })).toBe('list files');
    expect(toolSummary('Mystery', { a: 1 })).toBe('{"a":1}');
    expect(toolSummary('Mystery', null)).toBe('');
  });

  it('keeps the first line only', () => {
    expect(toolSummary('Bash', { command: 'cat <<EOF\nhello\nEOF' })).toBe('cat <<EOF …');
  });
});

describe('editOf', () => {
  it('reads Edit, MultiEdit and Write inputs', () => {
    expect(editOf('Edit', { file_path: 'a.ts', old_string: 'x', new_string: 'y' })).toEqual({
      path: 'a.ts',
      action: 'edited',
      hunks: [{ old: 'x', new: 'y' }],
    });
    expect(editOf('MultiEdit', { file_path: 'a.ts', edits: [{ old_string: '1', new_string: '2' }, { old_string: '3', new_string: '4' }] })?.hunks).toHaveLength(2);
    expect(editOf('Write', { file_path: 'n.ts', content: 'new' })).toEqual({ path: 'n.ts', action: 'wrote', hunks: [{ old: '', new: 'new' }] });
    // The tool's own result tells a new file from an overwrite.
    expect(editOf('Write', { file_path: 'n.ts', content: 'new' }, 'File created successfully at: n.ts')?.action).toBe('created');
    expect(editOf('Read', { file_path: 'a.ts' })).toBeNull();
    expect(editOf('Edit', { old_string: 'x' })).toBeNull();
  });

  it('reads the files an apply_patch touches', () => {
    const patch = '*** Begin Patch\n*** Add File: src/new.ts\n+hi\n*** Update File: src/old.ts\n@@\n-a\n+b\n*** End Patch';
    expect(editOf('apply_patch', { input: patch })).toMatchObject({ path: 'src/new.ts', action: 'created' });
  });
});

describe('lineDiff', () => {
  it('keeps unchanged lines as context and marks removed and added lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual([
      { op: ' ', text: 'a' },
      { op: '-', text: 'b' },
      { op: '+', text: 'B' },
      { op: ' ', text: 'c' },
    ]);
    expect(lineDiff('', 'new')).toEqual([{ op: '+', text: 'new' }]);
  });
});

describe('checks', () => {
  it('recognises test, build, type and lint commands, and nothing else', () => {
    expect(checkOf('npm test')).toBe('test');
    expect(checkOf('cd web && npx vitest run')).toBe('test');
    expect(checkOf('cargo test --workspace')).toBe('test');
    expect(checkOf('pytest -q tests/')).toBe('test');
    expect(checkOf('npx playwright test')).toBe('test');
    expect(checkOf('go test ./...')).toBe('test');
    expect(checkOf('npm run build')).toBe('build');
    expect(checkOf('cargo build --release')).toBe('build');
    expect(checkOf('npx tsc --noEmit -p .')).toBe('typecheck');
    expect(checkOf('cargo clippy')).toBe('lint');
    expect(checkOf('npx eslint src')).toBe('lint');
    expect(checkOf('ls -la')).toBeNull();
    expect(checkOf('cat test.txt')).toBeNull();
    expect(checkOf('git commit -m "fix tests"')).toBeNull();
  });

  it('reports only what the tool result shows', () => {
    expect(checkOutcome(undefined, undefined)).toMatchObject({ status: 'running', exit: null });
    expect(checkOutcome('Exit code 1\nTests: 2 failed, 10 passed', true)).toMatchObject({ status: 'error', exit: 1, line: 'Tests: 2 failed, 10 passed' });
    expect(checkOutcome('test result: ok. 12 passed; 0 failed', false)).toMatchObject({
      status: 'no-error',
      exit: null,
      line: 'test result: ok. 12 passed; 0 failed',
      mentionsFailure: false,
    });
    // No error flag, but the output mentions failures: shown, not resolved either way.
    expect(checkOutcome('3 failed', false)).toMatchObject({ status: 'no-error', mentionsFailure: true });
    expect(checkOutcome('ran npm test', false)).toMatchObject({ status: 'no-error', line: null });
  });
});

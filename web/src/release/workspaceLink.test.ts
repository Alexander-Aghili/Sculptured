import { expect, it } from 'vitest';
import { workspaceOrigin } from './workspaceLink';
it('allows local workspace navigation without arbitrary destinations or secrets', () => {
  expect(workspaceOrigin('http://127.0.0.1:4410')).toBe('http://127.0.0.1:4410');
  expect(workspaceOrigin('http://localhost:9999/')).toBe('http://localhost:9999');
  for (const value of ['https://evil.test', 'javascript:alert(1)', 'http://localhost.evil.test', 'http://user:password@localhost', 'http://localhost/private', 'http://localhost/?token=secret']) expect(workspaceOrigin(value)).toBeNull();
});

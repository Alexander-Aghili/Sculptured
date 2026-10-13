import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { codeFrom, connectedFrom, startRunner } from '../src/runner.mjs';

test('the pairing code and the connected line are read from the runner', () => {
  assert.equal(codeFrom('To connect this computer, enter the code WXYZ-2345 at https://app.x/connect'), 'WXYZ-2345');
  assert.equal(codeFrom('nothing here'), null);
  assert.equal(connectedFrom('Connected to https://app.x. Agents start here, in: /home/a'), true);
  assert.equal(connectedFrom('Connecting…'), false);
});

test('the bundled runner reports its code, then that it is connected, and stops on request', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sc-runner-'));
  const bin = path.join(dir, 'fake-sculptured.mjs');
  writeFileSync(bin, `#!/usr/bin/env node
console.log('enter the code BCDF-2345 at ' + process.argv[3] + '/connect');
setTimeout(() => console.log('Connected to ' + process.argv[3] + '. Agents start here.'), 100);
setInterval(() => {}, 1000);
`);
  chmodSync(bin, 0o755);
  const r = startRunner({ bin, origin: 'https://app.x', dataDir: dir, name: 'Test' });
  const code = await new Promise((res) => r.onCode(res));
  assert.equal(code, 'BCDF-2345');
  await new Promise((res) => r.onConnected(res));
  const exited = new Promise((res) => r.child.on('exit', res));
  r.stop();
  await exited;
  assert.ok(r.child.killed || r.child.exitCode !== null || r.child.signalCode !== null);
});

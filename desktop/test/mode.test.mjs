import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { allowedOrigins, loadMode, saveMode, validOrigin } from '../src/mode.mjs';

test('only an https origin with no path can be an account (loopback http in development)', () => {
  assert.equal(validOrigin('https://app.example.com'), 'https://app.example.com');
  assert.equal(validOrigin('https://app.example.com/'), 'https://app.example.com');
  assert.equal(validOrigin('https://app.example.com:8443'), 'https://app.example.com:8443');
  for (const bad of ['http://app.example.com', 'https://app.example.com/path', 'javascript:alert(1)', 'file:///etc/passwd', '', 'nonsense']) {
    assert.equal(validOrigin(bad), null, bad);
  }
  assert.equal(validOrigin('http://127.0.0.1:4430'), null, 'loopback http only in development');
  assert.equal(validOrigin('http://127.0.0.1:4430', { dev: true }), 'http://127.0.0.1:4430');
});

test('the chosen mode is remembered; a missing or broken file asks again', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sc-mode-'));
  assert.equal(loadMode(dir), null);
  saveMode(dir, { mode: 'account', origin: 'https://app.example.com' });
  assert.deepEqual(loadMode(dir), { mode: 'account', origin: 'https://app.example.com' });
  writeFileSync(path.join(dir, 'mode.json'), '{ broken');
  assert.equal(loadMode(dir), null);
  writeFileSync(path.join(dir, 'mode.json'), JSON.stringify({ mode: 'account', origin: 'http://evil.com' }));
  assert.equal(loadMode(dir), null, 'an origin that is not allowed is not trusted from the file');
});

test('the window may show only the allowed origins', () => {
  const local = 'http://127.0.0.1:4410';
  assert.deepEqual(allowedOrigins({ mode: 'local', local }), [local]);
  assert.deepEqual(allowedOrigins({ mode: 'local', origin: 'https://app.x.com', local }), [local, 'https://app.x.com'], 'Community through your account');
  assert.deepEqual(allowedOrigins({ mode: 'account', origin: 'https://app.x.com', local }), ['https://app.x.com']);
});

test('the window stays on allowed origins and sign-in providers, nowhere else', async () => {
  const { mayStay } = await import('../src/mode.mjs');
  const allowed = ['https://app.example.com'];
  assert.equal(mayStay('https://app.example.com/team/1', allowed), true);
  assert.equal(mayStay('https://accounts.google.com/o/oauth2/v2/auth?x=1', allowed), true);
  assert.equal(mayStay('https://github.com/login/oauth/authorize?x=1', allowed), true);
  assert.equal(mayStay('https://evil.example.com/', allowed), false);
  assert.equal(mayStay('http://accounts.google.com/', allowed), false);
  assert.equal(mayStay('not a url', allowed), false);
});

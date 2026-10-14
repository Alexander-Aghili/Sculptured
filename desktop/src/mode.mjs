// Which Sculptured this window shows: "local" (the workspace on this computer, as before) or
// "account" (your Sculptured account on the web, with this computer connected to it).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** An account address the app may open: https (loopback http in development), host and port only. */
export function validOrigin(s, { dev = false } = {}) {
  let u;
  try {
    u = new URL(String(s).trim());
  } catch {
    return null;
  }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  const scheme = u.protocol === 'https:' || (dev && loopback && u.protocol === 'http:');
  if (!scheme || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null;
  return u.origin;
}

/** The address the chooser pre-fills: SCULPTURED_ACCOUNT_ORIGIN, else the one a build was made for
 * (package.json `accountOrigin`, set by the Mac build the Computers page offers). */
export function defaultAccountOrigin(env, pkg) {
  return validOrigin(env.SCULPTURED_ACCOUNT_ORIGIN || pkg.accountOrigin || '') || '';
}

const file = (dir) => path.join(dir, 'mode.json');

/** The saved choice, or null to ask (missing, unreadable, or not trusted). */
export function loadMode(dir, { dev = false } = {}) {
  try {
    const m = JSON.parse(readFileSync(file(dir), 'utf8'));
    if (m.mode === 'local' && (m.origin == null || validOrigin(m.origin, { dev }))) return m.origin ? { mode: 'local', origin: validOrigin(m.origin, { dev }) } : { mode: 'local' };
    if (m.mode === 'account' && validOrigin(m.origin, { dev })) return { mode: 'account', origin: validOrigin(m.origin, { dev }) };
    return null;
  } catch {
    return null;
  }
}

export function saveMode(dir, m) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file(dir), JSON.stringify(m));
}

/**
 * Origins the window may show. Local mode: the workspace, plus your account's site when one is set
 * (for Community, which needs signing in; its "Add to project" comes back to the workspace).
 * Account mode: the account's site only.
 */
export function allowedOrigins({ mode, origin, local }) {
  if (mode === 'account') return [origin];
  return origin ? [local, origin] : [local];
}

/** Sign-in with Google or GitHub redirects through the provider's own pages before returning. */
export const SIGN_IN_ORIGINS = ['https://accounts.google.com', 'https://github.com'];

/** Whether the window may show `url`: an allowed origin, or a sign-in provider mid-sign-in. */
export function mayStay(url, allowed) {
  let origin;
  try { origin = new URL(url).origin; } catch { return false; }
  return allowed.includes(origin) || SIGN_IN_ORIGINS.includes(origin);
}

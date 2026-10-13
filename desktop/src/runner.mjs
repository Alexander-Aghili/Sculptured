// The bundled `sculptured connect` in account mode: pairs this computer with your account (the code
// is approved in the app's own window) and runs your agents here while the app is open.
import { spawn } from 'node:child_process';

/** "…confirm the code WXYZ-2345" → "WXYZ-2345". */
export function codeFrom(line) {
  const m = /\b([B-Z2-9]{4}-[B-Z2-9]{4})\b/.exec(line);
  return m ? m[1] : null;
}

export function connectedFrom(line) {
  return /^Connected to /.test(line.trim());
}

export function startRunner({ bin, origin, dataDir, name }) {
  const child = spawn(bin, ['connect', origin, '--data-dir', dataDir, '--name', name, '--no-browser'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const handlers = { code: [], connected: [] };
  let buffer = '';
  const read = (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const code = codeFrom(line);
      if (code) handlers.code.forEach((h) => h(code));
      if (connectedFrom(line)) handlers.connected.forEach((h) => h());
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', () => {});
  return {
    child,
    onCode: (h) => handlers.code.push(h),
    onConnected: (h) => handlers.connected.push(h),
    stop: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    },
  };
}

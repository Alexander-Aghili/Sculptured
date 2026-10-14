import { useEffect, useState } from 'react';
import { gw } from './session';
import { Icon } from '../shell/ui';

export type Os = 'mac' | 'windows' | 'linux';

/** The visitor's system, from the browser. */
export function detectOs(ua: string = navigator.userAgent): Os {
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  return 'linux';
}

const SYSTEMS: { os: Os; label: string; target: RegExp; open: string; paste: string }[] = [
  { os: 'mac', label: 'macOS', target: /apple-darwin/, open: 'Open Terminal (press ⌘ Space, type Terminal, press Return).', paste: 'paste it (⌘V) and press Return' },
  { os: 'windows', label: 'Windows', target: /windows/, open: 'Open PowerShell (Start menu, type PowerShell, press Enter).', paste: 'paste it (right-click or Ctrl+V) and press Enter' },
  { os: 'linux', label: 'Linux', target: /linux/, open: 'Open a terminal.', paste: 'paste it (Ctrl+Shift+V) and press Enter' },
];

/** The command that installs Sculptured on `os`, connects it with a one-time `key`, and keeps it running. */
export function connectCommand(os: Os, origin: string, key: string): string {
  return os === 'windows'
    ? `$env:SCULPTURED_KEY="${key}"; irm ${origin}/install.ps1 | iex`
    : `curl -fsSL ${origin}/install.sh | sh -s -- --key ${key}`;
}

type Copied = { command: string; copied: boolean };

/** Connect a computer: pick its system (yours is chosen), copy one command, paste it there. The command
 * carries a one-time key, so nothing needs approving; it installs Sculptured, lets agents work in your
 * home folder, and keeps it running in the background. */
export function ConnectComputer({ os: initial = detectOs() }: { os?: Os }) {
  const [os, setOs] = useState<Os>(initial);
  const releases = useReleases();
  const key = useConnectCommand(os);
  const sys = SYSTEMS.find((s) => s.os === os)!;
  const available = releases.targets?.some((t) => sys.target.test(t)) ?? false;
  return (
    <div className="connect-computer">
      <div role="tablist" aria-label="Your computer's system" className="connect-tabs">
        {SYSTEMS.map((s) => (
          <button key={s.os} role="tab" type="button" aria-selected={s.os === os} className={s.os === os ? 'on' : ''} onClick={() => { setOs(s.os); key.reset(); }}>
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={sys.label} className="connect-panel">
        {releases.targets === null ? (
          <p className="muted">Checking which systems Sculptured has builds for…</p>
        ) : !available ? (
          <p>There's no Sculptured build for {sys.label} yet. Connect a computer with another system for now.</p>
        ) : (
          <>
            {os === 'mac' && releases.macApp && <><MacAppSteps href={releases.macApp} /><h3 className="connect-or">Or use Terminal</h3></>}
            <CopySteps sys={sys} copied={key.copied} busy={key.busy} error={key.error} onCopy={() => void key.copy()} />
          </>
        )}
      </div>
    </div>
  );
}

/** The systems this gateway has a runner build for (null while asking), and the Mac app's link. */
function useReleases() {
  const [r, setR] = useState<{ targets: string[] | null; macApp: string | null }>({ targets: null, macApp: null });
  useEffect(() => {
    gw<{ targets: string[]; mac_app?: string | null }>('GET', '/releases')
      .then((x) => setR({ targets: x.targets, macApp: x.mac_app ?? null }), () => setR({ targets: [], macApp: null }));
  }, []);
  return r;
}

/** Gets a one-time key and copies `os`'s connect command with it. */
function useConnectCommand(os: Os) {
  const [copied, setCopied] = useState<Copied | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = async () => {
    setBusy(true); setError('');
    try {
      const { key } = await gw<{ key: string }>('POST', '/device/connect-key');
      const command = connectCommand(os, window.location.origin, key);
      const ok = await navigator.clipboard?.writeText(command).then(() => true, () => false) ?? false;
      setCopied({ command, copied: ok });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { copied, busy, error, copy, reset: () => { setCopied(null); setError(''); } };
}

type System = (typeof SYSTEMS)[number];

/** The Mac app: download, open it, choose your account and approve. It's signed ad hoc, not with an
 * Apple Developer ID, so macOS asks once before it first opens. */
function MacAppSteps({ href }: { href: string }) {
  return (
    <ol className="connect-steps">
      <li><span>Download the app (macOS 11 or later, Apple silicon or Intel).</span>
        <a className="btn btn-primary" href={href}><Icon name="download" size={14} />Download Sculptured for Mac</a>
      </li>
      <li>Open the download and drag Sculptured to Applications, then open it there.</li>
      <li>The first time, macOS says it can't check the app. Open System Settings → Privacy & Security, scroll down, and choose Open Anyway.</li>
      <li>In the app, under Sculptured account, choose Sign in to my account, then approve this computer. Agents run while the app is open.</li>
    </ol>
  );
}

/** The three steps for a system that has a build: copy, open a terminal, paste. */
function CopySteps({ sys, copied, busy, error, onCopy }: { sys: System; copied: Copied | null; busy: boolean; error: string; onCopy: () => void }) {
  return (
    <>
      <ol className="connect-steps">
        <li><span>Copy the command.</span>
          <button type="button" className="btn btn-primary" onClick={onCopy} disabled={busy}>
            <Icon name="copy" size={14} />Copy connect command
          </button>
        </li>
        <li>{sys.open}</li>
        <li>Then {sys.paste}. Sculptured installs (no admin rights), connects, and keeps running in the background, even after a restart.</li>
      </ol>
      {copied && (
        <div className="connect-copied" role="status">
          <p>{copied.copied ? <><Icon name="check" size={14} /> Copied. Now {sys.paste}.</> : 'Your browser would not copy it. Select it and copy it yourself:'}</p>
          <pre className="hosted-cmd">{copied.command}</pre>
          <p className="muted">This command works once, for 30 minutes. Agents may work anywhere in your home folder; change that later with <code>sculptured allow</code>.</p>
        </div>
      )}
      {error && <p className="tone-red" role="alert">{error}</p>}
    </>
  );
}

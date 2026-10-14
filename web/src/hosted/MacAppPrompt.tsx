import { useEffect, useState } from 'react';
import { gw } from './session';
import { AuthCard } from './AuthLayout';
import { Icon } from '../shell/ui';

const CHOSE_BROWSER = 'sculptured.mac-in-browser';

/** A browser on a Mac: not the Sculptured app's own window (Electron), and not an iPad, whose Safari
 * also says "Macintosh" but has a touch screen. */
export function isMacBrowser(ua: string, touchPoints: number): boolean {
  return /Macintosh/.test(ua) && !/Electron\/|Sculptured\//.test(ua) && touchPoints <= 1;
}

function choseBrowser(): boolean {
  try { return localStorage.getItem(CHOSE_BROWSER) === '1'; } catch { return false; }
}

/** On a Mac browser that hasn't chosen the browser before: the Mac app's link once known ('checking'
 * until then). Otherwise, or when there is no app, null. */
export function useMacApp(): { href: string | null; checking: boolean; chooseBrowser: () => void } {
  const offer = isMacBrowser(navigator.userAgent, navigator.maxTouchPoints ?? 0) && !choseBrowser();
  const [state, setState] = useState<{ href: string | null; checking: boolean }>({ href: null, checking: offer });
  useEffect(() => {
    if (!offer) return;
    gw<{ mac_app?: string | null }>('GET', '/releases').then((r) => setState({ href: r.mac_app ?? null, checking: false }), () => setState({ href: null, checking: false }));
  }, [offer]);
  const chooseBrowser = () => {
    try { localStorage.setItem(CHOSE_BROWSER, '1'); } catch { /* not remembered; the page still switches */ }
    setState({ href: null, checking: false });
  };
  return { ...state, chooseBrowser };
}

/** Instead of signing in on the web: the Mac app, where agents run on this Mac. */
export function MacAppCard({ href, onBrowser }: { href: string; onBrowser: () => void }) {
  return (
    <AuthCard title="Get Sculptured for Mac" lead="On a Mac, your agents run through the Sculptured app. Download it, then sign in there.">
      <MacAppSteps href={href} />
      <button type="button" className="auth-alt" onClick={onBrowser}>Continue in the browser</button>
    </AuthCard>
  );
}

/** The Mac app: download, open it, choose your account and approve. It's signed ad hoc, not with an
 * Apple Developer ID, so macOS asks once before it first opens. */
export function MacAppSteps({ href }: { href: string }) {
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


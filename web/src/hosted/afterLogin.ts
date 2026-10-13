/** Where to go after signing in: the page that sent the visitor to the sign-in screen (session storage,
 * so it survives the Google/GitHub round trip, which always ends on `/`). */
export const AFTER_LOGIN = 'sculptured.after-login';

/** A path on this site only: `/x`, never `//host` or `https://…`. */
export const sameSite = (p: string | null): p is string => !!p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\');

export function remember(path: string) {
  try { if (sameSite(path) && path !== '/login') sessionStorage.setItem(AFTER_LOGIN, path); } catch { /* storage off */ }
}

/** The remembered path, once (it is forgotten as it is read). */
export function takeRemembered(): string | null {
  try {
    const p = sessionStorage.getItem(AFTER_LOGIN);
    sessionStorage.removeItem(AFTER_LOGIN);
    return sameSite(p) ? p : null;
  } catch {
    return null;
  }
}

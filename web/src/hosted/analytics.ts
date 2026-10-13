/**
 * Hosted beta analytics from the browser: the session, active time per page *template* (never a
 * team or agent name) and a fixed set of named actions. Started only when signed in to the hosted
 * beta; local mode never starts it, so `track` does nothing there. The gateway allowlists every
 * event again before storing it.
 */
export type UiAction =
  | 'open-token-use'
  | 'switch-graph'
  | 'switch-list'
  | 'collapse-group'
  | 'describe-it'
  | 'download-run'
  | 'import-run'
  | 'export-team-file'
  | 'import-team-file'
  | 'open-git'
  | 'open-computers'
  | 'answer-question'
  | 'add-from-community';

/** The app's page routes, with `{param}` where a name or id goes (the gateway keeps the same list). */
const PAGE_PATTERNS = [
  '/', '/admin', '/community', '/computers', '/connect', '/join/{token}', '/library', '/library/{collection}', '/login', '/reset/{token}',
  '/rig/{rig}', '/rig/{rig}/agent/{seat}', '/rig/{rig}/agent/{seat}/{tab}', '/team/{team}', '/team/{team}/git', '/team/{team}/live',
  '/team/{team}/progress', '/team/{team}/structure', '/what-we-record',
].map((p) => p.split('/'));
const SECTIONS = new Set(['team', 'rig', 'library', 'community', 'join', 'reset', 'admin', 'connect', 'computers', 'what-we-record', 'login']);

/**
 * `/team/secret-plan/structure` → `/team/:id/structure`, by position: a team called "library" is
 * still `:id`. A path matching no pattern keeps only its section.
 */
export function routeTemplate(pathname: string): string {
  const segs = pathname.split('/');
  const fits = PAGE_PATTERNS.filter((ps) => ps.length === segs.length && ps.every((p, i) => p.startsWith('{') || p === segs[i]));
  const best = fits.sort((a, b) => b.filter((p) => !p.startsWith('{')).length - a.filter((p) => !p.startsWith('{')).length)[0];
  if (best) return best.map((p) => (p.startsWith('{') ? ':id' : p)).join('/');
  return segs.map((s, i) => (s === '' || (i === 1 && SECTIONS.has(s)) ? s : ':id')).join('/');
}

type Event = { name: string; props: Record<string, unknown> };

const BEAT_MS = 15_000;
let queue: Event[] = [];
let running: { csrf: string } | null = null;

function flush(csrf: string) {
  while (queue.length > 0) {
    const events = queue.splice(0, 20);
    void fetch('/gw/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  }
}

/** Starts reporting for a signed-in hosted session; returns a function that stops it. */
export function startAnalytics(csrf: string, route: () => string): () => void {
  running = { csrf };
  queue.push({ name: 'session.start', props: {} });
  const beat = window.setInterval(() => {
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      queue.push({ name: 'page.active', props: { route: route(), seconds: BEAT_MS / 1000 } });
    }
    flush(csrf);
  }, BEAT_MS);
  const leave = () => {
    queue.push({ name: 'session.end', props: {} });
    flush(csrf);
  };
  window.addEventListener('pagehide', leave);
  return () => {
    window.clearInterval(beat);
    window.removeEventListener('pagehide', leave);
    running = null;
    queue = [];
  };
}

/** A named action, reported with the next batch (nothing in local mode). */
export function track(name: UiAction) {
  if (running) queue.push({ name: 'ui.action', props: { name } });
}

/** Everything the beta records, as the gateway allowlists it (shown on /what-we-record; a test keeps
 * this list equal to the gateway's). */
export const RECORDED_EVENTS: { name: string; from: 'Sculptured site' | 'Your browser' | 'Your Sculptured'; what: string }[] = [
  { name: 'auth.signin', from: 'Sculptured site', what: 'You signed in, and how (password, Google or GitHub)' },
  { name: 'invite.used', from: 'Sculptured site', what: 'An invite was used to join' },
  { name: 'device.paired', from: 'Sculptured site', what: 'A computer was connected, and its operating system' },
  { name: 'device.revoked', from: 'Sculptured site', what: 'A computer was disconnected' },
  { name: 'api', from: 'Sculptured site', what: 'A request: its kind, the page or action with names removed (for example /api/teams/:id/git), its status and how long it took' },
  { name: 'session.start', from: 'Your browser', what: 'You opened Sculptured' },
  { name: 'session.end', from: 'Your browser', what: 'You left' },
  { name: 'page.active', from: 'Your browser', what: 'Every 15 seconds while the tab is in front: which kind of page (names removed)' },
  { name: 'ui.action', from: 'Your browser', what: 'You used a feature such as Describe it, Token use or Download run (its name only)' },
  { name: 'team.created', from: 'Your Sculptured', what: 'A team was made, and from what (a template, a file, a description)' },
  { name: 'team.saved', from: 'Your Sculptured', what: "A team's shape (counts only: agents by kind, groups, arrows; whether checks, limits, copies or a workflow are used), at most every 10 minutes" },
  { name: 'team.started', from: 'Your Sculptured', what: 'A team started: how many agents, which programs, how many models, its shape' },
  { name: 'team.stopped', from: 'Your Sculptured', what: 'A team stopped' },
  { name: 'run.summary', from: 'Your Sculptured', what: 'A finished run: duration, tokens in and out, agents, spawned agents, failed agents' },
  { name: 'check.ran', from: 'Your Sculptured', what: "A check ran, and whether it passed (never the command or its output)" },
  { name: 'copies.enabled', from: 'Your Sculptured', what: "Agents' own copies were turned on" },
  { name: 'plan.held', from: 'Your Sculptured', what: 'A start waited because a plan was near its limit' },
];

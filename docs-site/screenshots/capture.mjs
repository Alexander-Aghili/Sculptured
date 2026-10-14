// Captures the docs' screenshots from the real, running app: never drawn or mocked.
//
//   1. Build and serve the app with a fresh data folder and Practice agents (no model is called):
//        cargo build -p sculptured && npm --prefix web run build
//        sculptured serve --port 4499 --data-dir <empty folder> --claude-program <fixture CLI>
//      The fixture CLI (see README.md here) answers "Improve this team with AI" with one canned team.
//   2. node screenshots/capture.mjs --base http://127.0.0.1:4499
//
// Every team, prompt and session in the shots is a made-up demo; nothing personal is shown.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
// Required: the demo server to drive. There is no default, so the script never touches a Sculptured you use.
const base = arg('--base', null);
if (!base) {
  console.error('usage: node screenshots/capture.mjs --base http://127.0.0.1:<demo port> [--session-folder <dir>] [--only <step>]');
  process.exit(2);
}
// The demo session ran in this folder (the served app's home folder + /app), so its agents' folders are allowed.
const sessionFolder = arg('--session-folder', '/work/app');
const chrome = arg('--chrome', '/usr/bin/google-chrome');
const images = new URL('../images/', import.meta.url).pathname;
const fixtures = new URL('../../crates/controld/tests/fixtures/sessions/claude/', import.meta.url).pathname;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => `docs-${Math.random().toString(36).slice(2)}`;

async function api(method, url, body, type = 'application/json') {
  const res = await fetch(base + url, { method, headers: { 'content-type': type }, body: type === 'application/json' && body !== undefined ? JSON.stringify(body) : body });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** A Practice team from a template, renamed, with these jobs and agent names (by template agent name). */
async function team(template, name, jobs = {}, names = {}) {
  const rec = await api('POST', '/api/teams', { request_id: rid(), template, practice: true, name });
  const draft = { ...rec.draft, agents: rec.draft.agents.map((a) => ({ ...a, job: jobs[a.name] ?? a.job, name: names[a.name] ?? a.name })) };
  return (await api('PUT', `/api/teams/${rec.draft.id}`, { request_id: rid(), revision: rec.draft.revision, draft })).draft;
}

async function start(draft) {
  await api('POST', `/api/teams/${draft.id}/start`, { request_id: rid(), revision: draft.revision });
}

/** The run's agents: [{ id, name, parent }]. */
async function agents(id) {
  const runs = await api('GET', `/api/teams/${id}/deployments`);
  return (await api('GET', `/api/teams/${id}/deployments/${runs[0].start_seq}`)).agents;
}

const send = (seat, text) => api('POST', `/api/seats/${encodeURIComponent(seat)}/send`, { request_id: rid(), text, intent: 'instruct', interrupt: false });

async function shot(page, name, opts = {}) {
  const file = path.join(images, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await wait(opts.settle ?? 1200);
  await page.screenshot({ path: file, ...(opts.clip ? { clip: opts.clip } : {}) });
  console.log(`saved ${name} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
}

async function open(page, url) {
  await page.goto(base + url, { waitUntil: 'load' });
  await wait(1500);
}

/** Clicks the first element of `selector` whose text or label contains `text`. */
async function click(page, selector, text) {
  const handle = await page.waitForFunction(
    (sel, t) => [...document.querySelectorAll(sel)].find((e) => (e.getAttribute('aria-label') || e.textContent || '').includes(t)),
    { timeout: 10_000 }, selector, text,
  );
  await handle.asElement().evaluate((e) => {
    e.scrollIntoView({ block: 'center' });
    e.click();
  });
  await wait(600);
}

/** The board's right-hand details panel, where a team's Advanced section is. */
async function showDetails(page) {
  const button = await page.$('button[aria-label="Show details panel"]');
  if (button) await button.evaluate((e) => e.click());
  await wait(600);
}

async function graph(page) {
  await click(page, 'button', 'Graph');
  await wait(1500);
}

const launch = () => puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--hide-scrollbars'] });

async function main() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    const only = arg('--only', null);
    const from = arg('--from', null);
    let on = !from;
    for (const step of [startFrom, websiteLaunch, manyChildren, importSession]) {
      on ||= step.name === from;
      if (on && (!only || step.name === only)) await step(page);
    }
  } finally {
    await browser.close();
  }
}

/** First visit: the Start from… gallery. */
async function startFrom(page) {
  await open(page, '/');
  await shot(page, 'quickstart/start-from.png');
}

/** A Practice team: Design board, its Advanced limits, Run board with a question, the card, phone, History. */
async function websiteLaunch(page) {
  const draft = await team('planner-builders', 'Website launch', {
    Planner: 'Plan the landing page and hand each section to a builder.',
    'Builder 1': 'Build the landing page header and hero section.',
    'Builder 2': 'Build the pricing section.',
  });
  await open(page, `/team/${draft.id}/structure`);
  await shot(page, 'quickstart/design-board.png');
  await showDetails(page);
  await click(page, 'details.team-advanced > summary', 'Advanced');
  await (await page.$('details.team-advanced')).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot(page, 'guides/team-limits.png');
  await start(draft);
  await wait(4000);
  const planner = (await agents(draft.id)).find((a) => a.name === 'Planner');
  // A Practice agent asks when its message starts with "ask:".
  await send(planner.id, 'ask: Which colour scheme should the new landing page use? | Calm blue | Bold orange');
  await wait(2500);
  await open(page, `/rig/${draft.id}`);
  await graph(page);
  await shot(page, 'quickstart/run-board.png');
  await open(page, `/rig/${draft.id}/agent/${encodeURIComponent(planner.id)}`);
  const card = await page.waitForSelector('.open-questions');
  const box = await card.boundingBox();
  await shot(page, 'guides/question-card.png', { clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } });
  await page.setViewport({ width: 390, height: 844 });
  await open(page, `/rig/${draft.id}`);
  await shot(page, 'quickstart/phone.png');
  await page.setViewport({ width: 1280, height: 800 });
  await history(page, draft.id);
}

/** History, in a browser of its own: over plain HTTP, Chrome allows six connections per host, and the
 * live boards opened before keep theirs busy for a while. */
async function history(_page, id) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await open(page, `/rig/${id}?view=history`);
    await page.waitForFunction(() => [...document.querySelectorAll('option')].some((o) => o.textContent.includes('#1')), { timeout: 15_000 });
    await shot(page, 'guides/history.png', { settle: 2000 });
  } finally {
    await browser.close();
  }
}

/** One Practice agent that starts eight helpers: the Run board folds them into "+N more". */
async function manyChildren(page) {
  const draft = await team('solo', 'Research sprint', { Claude: 'Split the research into topics and start a helper for each.' }, { Claude: 'Lead researcher' });
  await start(draft);
  await wait(3000);
  const lead = (await agents(draft.id))[0];
  const topics = ['pricing pages', 'onboarding emails', 'docs search', 'status pages', 'changelogs', 'API keys', 'billing', 'team invites'];
  for (const [i, t] of topics.entries()) {
    await send(lead.id, `spawn_agent:${JSON.stringify({ request_id: `topic-${i}`, name: `Research ${t}`, task: `Find three good examples of ${t}.` })}`);
    await wait(1500);
  }
  await wait(3000);
  await open(page, `/rig/${draft.id}`);
  await graph(page);
  // The board fits every saved box, folded ones too; zoom in (the "+" key) so the cards can be read.
  await page.mouse.click(640, 720);
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  await shot(page, 'guides/more-children.png', { settle: 1500 });
}

/** Import a Claude Code session (the test fixture: a made-up "login page" session), then improve it. */
async function importSession(page) {
  await open(page, '/');
  await click(page, 'button', 'New project');
  await click(page, 'summary', 'Advanced');
  const form = await page.waitForSelector('[aria-label="Import a past run"]');
  await form.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'import/import-form.png');
  const input = await page.waitForSelector('[aria-label="Import a past run"] input[type=file][multiple]');
  // The fixture session, moved to the demo folder; only one subagent's files, so the preview lists the others as missing.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-'));
  const files = ['main-with-agents.jsonl', 'subagents/agent-a1.jsonl', 'subagents/agent-a1.meta.json'].map((f) => {
    const to = path.join(dir, path.basename(f));
    fs.writeFileSync(to, fs.readFileSync(path.join(fixtures, f), 'utf8').replaceAll('/work/app', sessionFolder));
    return to;
  });
  await input.uploadFile(...files);
  await page.waitForSelector('.import-preview');
  await (await page.$('.import-preview')).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'import/preview.png');
  await click(page, '.import-preview button', 'Import');
  await wait(2500);
  await shot(page, 'import/history.png');
  const teams = await api('GET', '/api/teams');
  const imported = teams.find((t) => (t.draft ?? t).name === 'Login page');
  const id = (imported.draft ?? imported).id;
  await open(page, `/team/${id}/structure`);
  await shot(page, 'import/team.png');
  await showDetails(page);
  await click(page, 'details.team-advanced > summary', 'Advanced');
  await click(page, 'details.team-advanced button', 'Improve this team with AI');
  await click(page, 'button', 'Ask Claude Code');
  await page.waitForSelector('.improve-offer', { timeout: 30_000 });
  await (await page.$('.improve-offer')).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await shot(page, 'import/improve.png');
}

await main();

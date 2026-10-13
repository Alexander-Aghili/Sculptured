// Builds the public docs (docs.json + *.mdx, written for Mintlify) into static HTML in dist/, so the
// beta serves docs.<domain> itself. Only the components these pages use are implemented.
import { evaluate } from '@mdx-js/mdx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as React from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import remarkGfm from 'remark-gfm';

const here = path.dirname(fileURLToPath(import.meta.url));
const h = React.createElement;

const components = {
  CardGroup: ({ cols = 2, children }) => h('div', { className: 'cards', style: { '--cols': cols } }, children),
  Card: ({ title, href, children }) =>
    h('a', { className: 'card', href }, h('strong', null, title), h('span', null, children)),
  Steps: ({ children }) => h('ol', { className: 'steps' }, children),
  Step: ({ title, children }) => h('li', null, h('strong', null, title), h('div', null, children)),
  Note: (p) => callout('note', 'Note', p.children),
  Tip: (p) => callout('tip', 'Tip', p.children),
  Warning: (p) => callout('warning', 'Warning', p.children),
};
function callout(kind, label, children) {
  return h('aside', { className: `callout ${kind}`, role: 'note' }, h('strong', null, label), h('div', null, children));
}

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: src };
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s(.*)/s).slice(0, 2)).filter((kv) => kv.length === 2));
  return { meta, body: src.slice(m[0].length) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page({ title, description, content, nav, current }) {
  const sidebar = nav
    .map((g) => `<p class="group">${esc(g.group)}</p><ul>${g.pages
      .map((p) => `<li><a ${p.id === current ? 'aria-current="page" ' : ''}href="/${p.id}">${esc(p.title)}</a></li>`)
      .join('')}</ul>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Sculptured docs</title>
<meta name="description" content="${esc(description ?? '')}">
<link rel="icon" href="/images/sculptured-coastal-emblem.png">
<style>${CSS}</style>
</head>
<body>
<header><a class="brand" href="/"><img src="/images/sculptured-coastal-emblem.png" alt="" width="28" height="28">Sculptured docs</a></header>
<div class="layout">
<nav aria-label="Documentation">${sidebar}</nav>
<main>
<h1>${esc(title)}</h1>
${description ? `<p class="lede">${esc(description)}</p>` : ''}
${content}
</main>
</div>
</body>
</html>
`;
}

const CSS = `
:root { --bg:#fbfcfc; --panel:#f1f5f5; --text:#16211f; --muted:#52615e; --line:#d6e0de; --accent:#477C80; --accent-soft:#e3efee; --warn:#8a5a00; --warn-soft:#fff4dc; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1716; --panel:#162220; --text:#e4ecea; --muted:#9db0ac; --line:#2a3a37; --accent:#8fc4bd; --accent-soft:#1c2f2d; --warn:#f0c46a; --warn-soft:#2f2614; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color:var(--accent); }
header { padding:12px 16px; border-bottom:1px solid var(--line); }
.brand { display:inline-flex; align-items:center; gap:10px; font-weight:600; color:var(--text); text-decoration:none; }
.layout { display:grid; grid-template-columns:240px minmax(0,1fr); max-width:1100px; margin:0 auto; }
nav { padding:16px; border-right:1px solid var(--line); }
nav .group { margin:16px 0 4px; font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:600; }
nav ul { list-style:none; margin:0; padding:0; }
nav a { display:block; padding:4px 8px; border-radius:6px; color:var(--text); text-decoration:none; }
nav a[aria-current="page"] { background:var(--accent-soft); color:var(--accent); font-weight:600; }
main { padding:24px 32px 64px; min-width:0; }
h1 { margin:0 0 4px; font-size:2rem; line-height:1.2; }
.lede { color:var(--muted); font-size:1.1rem; margin-top:0; }
pre { background:var(--panel); padding:12px 14px; border-radius:8px; overflow-x:auto; }
code { font-family:ui-monospace, "SF Mono", Menlo, monospace; font-size:.9em; }
table { border-collapse:collapse; display:block; overflow-x:auto; }
th, td { border:1px solid var(--line); padding:6px 10px; text-align:left; }
.cards { display:grid; grid-template-columns:repeat(var(--cols), minmax(0,1fr)); gap:12px; margin:16px 0; }
.card { display:flex; flex-direction:column; gap:4px; padding:14px 16px; border:1px solid var(--line); border-radius:10px; color:var(--text); text-decoration:none; }
.card:hover, .card:focus-visible { border-color:var(--accent); }
.card span { color:var(--muted); font-size:.95rem; }
.steps { padding-left:1.4em; }
.steps li { margin:10px 0; }
.callout { margin:16px 0; padding:10px 14px; border-left:4px solid var(--accent); background:var(--accent-soft); border-radius:6px; }
.callout.warning { border-color:var(--warn); background:var(--warn-soft); }
.callout > strong { display:block; font-size:.85rem; }
@media (max-width: 760px) {
  .layout { grid-template-columns:1fr; }
  nav { border-right:0; border-bottom:1px solid var(--line); }
  main { padding:16px 16px 48px; }
  .cards { grid-template-columns:1fr; }
}
`;

export async function build(out = path.join(here, 'dist')) {
  const config = JSON.parse(fs.readFileSync(path.join(here, 'docs.json'), 'utf8'));
  const pages = new Map();
  for (const id of config.navigation.groups.flatMap((g) => g.pages)) {
    const { meta, body } = frontmatter(fs.readFileSync(path.join(here, `${id}.mdx`), 'utf8'));
    pages.set(id, { id, title: meta.title ?? id, description: meta.description, body });
  }
  const nav = config.navigation.groups.map((g) => ({ group: g.group, pages: g.pages.map((id) => pages.get(id)) }));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const p of pages.values()) {
    const { default: Content } = await evaluate(p.body, { ...runtime, remarkPlugins: [remarkGfm], baseUrl: pathToFileURL(here) });
    const content = renderToStaticMarkup(h(Content, { components }));
    const file = path.join(out, `${p.id}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, page({ ...p, content, nav, current: p.id }));
  }
  const first = config.navigation.groups[0].pages[0];
  fs.copyFileSync(path.join(out, `${first}.html`), path.join(out, 'index.html'));
  fs.cpSync(path.join(here, 'images'), path.join(out, 'images'), { recursive: true });
  // The portable formats' JSON Schemas, at the address exported team files name in "$schema".
  fs.cpSync(path.join(here, '../web/public/schema'), path.join(out, 'schema'), { recursive: true });
  return [...pages.keys()];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const built = await build();
  console.log(`built ${built.length} pages into dist/`);
}

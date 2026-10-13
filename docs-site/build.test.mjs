// Builds the site into a temporary folder and checks what a reader gets: every page in docs.json,
// working navigation, rendered components, and no raw MDX left in the output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from './build.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-'));
try {
  await build(out);
  const nav = JSON.parse(fs.readFileSync(new URL('./docs.json', import.meta.url), 'utf8')).navigation.groups;
  const pages = nav.flatMap((g) => g.pages);
  for (const page of pages) {
    const file = path.join(out, `${page}.html`);
    assert.ok(fs.existsSync(file), `${page}.html is built`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<title>[^<]+ · Sculptured docs<\/title>/, `${page} has a title`);
    assert.doesNotMatch(html, /<(Card|CardGroup|Steps|Step|Note|Tip|Warning)[\s>]/, `${page} has no raw components`);
    for (const other of pages) assert.ok(html.includes(`href="/${other}"`), `${page} links to ${other} in the sidebar`);
    assert.ok(html.includes(`aria-current="page" href="/${page}"`), `${page} marks itself current`);
  }
  const intro = fs.readFileSync(path.join(out, 'introduction.html'), 'utf8');
  assert.match(intro, /<a class="card" href="\/quickstart">/, 'cards are links');
  assert.match(intro, /<aside class="callout note"/, 'notes are callouts');
  const quick = fs.readFileSync(path.join(out, 'quickstart.html'), 'utf8');
  assert.match(quick, /<ol class="steps">/, 'steps are an ordered list');
  assert.equal(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), intro, 'the home page is the introduction');
  assert.ok(fs.existsSync(path.join(out, 'images/sculptured-coastal-emblem.png')), 'images are copied');
  for (const f of ['team-v1.json', 'session-v1.json']) {
    assert.ok(JSON.parse(fs.readFileSync(path.join(out, 'schema', f), 'utf8')).$schema, `the ${f} schema is published`);
  }
  console.log(`build.test: ok (${pages.length} pages)`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

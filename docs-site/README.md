# Sculptured documentation

This directory contains the public user guides and reference pages for [docs.usesculptured.com](https://docs.usesculptured.com). Pages are written in MDX, with navigation in `docs.json`. The same sources support a Mintlify preview and the static site built by `build.mjs`.

For architecture and implementation details, see [the internals documentation](../docs/internals/README.md).

## Find the right page

- **Getting started:** introduction, quickstart, computer setup and concepts.
- **Task guides:** team design, running agents, workflows, reuse and sharing.
- **Reference:** commands, agent tools, file formats, states and limits.
- **Operations and help:** self-hosting, security, privacy and troubleshooting.

Keep the quickstart focused on a first successful run. Put detailed procedures in guides and exact fields, defaults and limits in reference pages. Link to those pages instead of repeating their contents.

## Preview locally

From this directory:

```bash
npm ci
npm run dev
```

The Mintlify preview runs on port 4411. Navigation and page content work without a Mintlify login; development search requires one. The preview may listen on the LAN as well as localhost, and serves only documentation.

## Check a change

Run these commands from this directory after editing MDX or navigation:

```bash
npm test
npm run validate
npm run links
```

`npm test` builds every navigation page in a temporary directory and checks rendered components, navigation, Markdown exports, schemas and screenshots. Mintlify's commands validate the site configuration and check internal links.

To produce the static site:

```bash
npm run build
```

The output is written to `dist/`, including HTML, images, Markdown pages, `llms.txt` and `llms-full.txt`. Generated output should not be edited directly.

## Write and maintain pages

Use a descriptive title and a short summary of what the reader can do or learn. Lead a procedure with its prerequisites, then give steps in the order the reader performs them. Use the app's exact labels for controls.

Keep agent reports, captured events, estimates and verified checks distinct. Describe limits and failure behavior where they affect the reader's next action. Check behavior against the source before changing a factual claim.

Preserve page paths and heading anchors when possible. Update internal links when a heading changes, and add new pages to `docs.json`. Use recordings or screenshots of the real application for UI illustrations; see [the screenshot workflow](screenshots/README.md).

## Publish

The static output can be served as the documentation site. To use Mintlify hosting, configure a documentation project with this directory as its content root and connect the repository and documentation domain there.

Publishing documentation does not deploy the Sculptured app or grant access to an agent runner.

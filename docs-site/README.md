# Sculptured documentation

This is a separate Mintlify site, using the standard Mint theme and MDX components.
It does not mount React application routes or replace the workspace UI.

```bash
npm ci
npm run dev
npm run validate
npm run links
```

The local preview runs on port 4411. Mintlify development search requires a Mintlify
login; normal navigation and page content work without one. The preview CLI may
listen on the LAN as well as localhost; it serves public documentation only.

For publication, create/configure a Mintlify documentation project and set its content
root to this `docs-site` directory, or publish this directory in its own documentation
repository. Connect the repository in Mintlify and configure a docs domain there.
This does not deploy or grant access to the local agent runner. No public documentation
site or Mintlify account was created by this change.

Do not edit a custom React documentation page: update these MDX files and `docs.json`.
`build.mjs` renders these pages to static HTML (`npm run build`); `npm test` checks every page builds.

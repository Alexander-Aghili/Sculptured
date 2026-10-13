# Release verification — 2026-10-09

Scope: Sculptured only, on the existing m2 worktree. No public deployment or real model run was performed.

## Passing checks

- 531 browser-component/unit tests across 63 files. Both local and community TypeScript/Vite builds pass.
- Local Rust suites (`controld`, `rigspec`, `hostd`, `drivers`): 561 tests passed before final narrow fixes; subsequent managed-collaboration tests (2) and disk sampler regression test (1) pass.
- PostgreSQL service unit/type-export tests and its real-database integration test pass against a disposable PostgreSQL 17 container and an in-process signed OIDC provider. Checks cover PKCE setup, browser-bound state, callback replay, wrong audience/nonce, CSRF/origin/Host, ownership, sanitization, immutable saved versions, stale-version updates, expiry, revocation and cross-instance visibility.
- Container builds with Node 24 and Rust 1.94. The final non-root, read-only image starts, migrates PostgreSQL, serves the catalog and returns ready. Compose configuration validates.
- Actual browser interactions: fixture OIDC sign-in, database profile update, save/reload, group inspection and Escape/focus restoration; Git init, stage, diff, commit and branch; managed child visibility, individual hard stop, team stop and empty Live view; example creation as an unstarted draft.
- Installed local application was backed up and upgraded. The Textbook Creator draft and private Library were preserved; no real agents were started.
- Desktop and 390px mobile views were inspected. Dashboard content fits the mobile viewport. Temporary viewport overrides were reset. Screenshots are actual running UI, not reconstructed screens.

## Remaining release gates / limitations

- A real domain, managed OIDC configuration (including provider-enforced MFA/passkeys), HTTPS login/callback acceptance, restore drill and production load testing still need the deployment operator. The public service is implemented and packaged, not publicly deployed or independently security-audited.
- Browser upload automation is blocked by the user's extension file-URL setting. That setting was preserved. Upload/review/sanitization is covered by component and API checks; a full browser upload remains unverified.
- Repository ESLint remains failing: 117 errors (predominantly existing and new file/function size limits) and 3 existing hook warnings. This is not a clean-lint release claim. Generated TypeScript also emits trailing whitespace; generated files were not manually edited.
- Local production bundle emits a >500KB chunk warning (about 707KB minified). Public bundle is about 354KB.
- Git UI covers local init/status/diff/stage/unstage/commit/new branch. Fetch/pull/push/merge, custom hooks and signed commits remain terminal operations.
- The operator's saved Textbook Creator already contained an extra `3D Engine Creator 2` group with two routes that cannot reach completion. This existed in the pre-upgrade database backup and was preserved. Its setup validation blocks starting that draft until corrected.

See operations and deployment instructions (sculptured-community).

## UI revision — 2026-10-09

At the operator's request, removed the standalone Monitor, Examples, Docs, Settings and
Account routes and the permanent navigation/theme overrides. Restored compact workspace
navigation and agent controls under Details & controls. Community is the account entry;
its hosted root opens the profile, with saved/browse/publish beneath the same account area.
No project or account database data was removed.

Documentation now lives in `docs-site/`, using the standard Mintlify Mint theme and MDX
components. Mintlify validation and broken-link checks passed; actual docs navigation and
the restored workspace were checked in Chrome. Local and community builds pass, as do
532 UI tests in 64 files. The docs preview runs separately on port 4411; it is not a public
deployment. Mintlify preview search requires a Mintlify login and was not enabled.

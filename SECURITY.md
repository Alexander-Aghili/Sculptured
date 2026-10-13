# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- **Preferred:** [open a private vulnerability report](https://github.com/Alexander-Aghili/sculptured/security/advisories/new) on GitHub.
- **Or email** security@usesculptured.com.

Include what you found, how to reproduce it, and the version or commit. You will get an acknowledgement within three working days. We will keep you updated until a fix is released, and credit you in the release notes if you wish.

## Scope

Sculptured runs coding agents on your own computer with your own Claude Code and Codex sign-in. Reports we especially want:

- A way for a web page, another local user or a remote party to reach `sculptured serve` (it must only listen on loopback) or drive agents without the user.
- Reading or writing files outside the folders a team is allowed to use.
- A connected computer's runner accepting work its owner's folder policy refuses.
- Secrets (CLI tokens, instance or device keys) leaking into logs, exports or the browser.

Agents themselves act with the permissions you give them: an agent with full access running a command you asked for is expected behaviour, not a vulnerability.

## Supported versions

Only the latest release and `main` receive security fixes.

# Sculptured desktop (Electron)

A desktop window on the local workspace. On launch it uses a Sculptured already answering on
`127.0.0.1:4410`, or starts the bundled `sculptured serve` (which starts the agent runner) with your
usual data folder (`~/.sculptured`). Closing the app stops the `serve` it started; the agent runner keeps
running agents, exactly as when `serve` stops. Sign-in pages (Claude Code, Codex, Community) open in
the system browser.

## Build

```bash
cargo build --release -p sculptured          # the binary bundled as resources/bin
npm --prefix web ci && npm --prefix web run build   # the web app bundled as resources/web
cd desktop && npm ci
npm run pack     # unpacked app in dist/<platform>-unpacked (quick check)
npm run dist     # installers: Linux .deb + AppImage, macOS .dmg, Windows .exe
```

Build each platform's installer on that platform (the Rust binary is native).

`SCULPTURED_PORT`, `SCULPTURED_DATA_DIR` and `SCULPTURED_BIN` override the port, data folder and binary
(for trying a build without touching your teams).

## Linux sandbox

Prefer the `.deb` on Ubuntu: it installs Chromium's `chrome-sandbox` helper owned by root with mode
4755. An unpacked build or AppImage on Ubuntu 24.04+ stops with "The SUID sandbox helper binary was
found, but is not configured correctly" unless that helper is fixed
(`sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`) or the system allows
unprivileged user namespaces. Do not ship `--no-sandbox`.

## Modes

On first launch the app asks how to use Sculptured, and remembers the answer (menu: **Sculptured → Switch mode…**):
- **On this computer:** the local workspace, as before. If you enter your account's address, Community opens inside the app. Community needs you to sign in; its *Add to project* downloads blocks into your local Library.
- **Sculptured account:** your account's site. The bundled `sculptured connect` pairs this computer (approve the code in the same window) and runs your agents while the app is open. Quitting asks first, then stops the runner and its agents.

Teams and settings aren't synced between the two modes yet.

- `SCULPTURED_ACCOUNT_ORIGIN` pre-fills the account address.
- `SCULPTURED_DEV=1` also allows `http://127.0.0.1` addresses, for staging.
- `npm test` runs the unit tests (node:test).

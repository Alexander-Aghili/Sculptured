# Releasing

**What a release provides:** the `sculptured` builds that `install.sh` downloads (the gateway serves the install script at `/install.sh`). The script fetches `sculptured-<target>.tar.gz` and its `.sha256` from the latest release; `GATEWAY_RELEASES_URL` points it at a different release folder.

## Cutting a release

1. In GitHub, open **Actions → Release → Run workflow**, enter a tag (for example `v0.1.0`) and run it.
2. The workflow builds `sculptured` for:
   - Linux x86_64;
   - Linux arm64;
   - macOS Apple silicon.

   It packages each build with `deploy/release/package.sh` and drafts a release holding the files.
3. Check the draft, then **Publish** it. `install.sh` uses the latest *published* release.

## Cost

The workflow runs only when started by hand, never on push or on a schedule.
- **Public repositories:** Linux and macOS minutes are free.
- **Private repositories:** there is a monthly free allowance, and macOS minutes count 10× against it. If the account would be billed, don't run it; build locally instead (below).

**Intel macOS** is commented out in the matrix to save macOS minutes. To add it, uncomment the line and change `install.sh`'s `Darwin-x86_64` case, which refuses Intel Macs for now.

## Building locally instead

```sh
cargo build --release -p sculptured
sh deploy/release/package.sh x86_64-unknown-linux-gnu target/release/sculptured dist
```

Upload `dist/*` to a release, or point `GATEWAY_RELEASES_URL` at any folder serving them.

**The desktop app's installers** are built on each OS with `cd desktop && npm ci && npx electron-builder` (see `desktop/README.md`).

## Later

These are deferred:
- Windows builds and `install.ps1`;
- the desktop installers in CI;
- a universal macOS dmg;
- code signing (Apple Developer ID and notarization; a Windows certificate);
- CI on every push.

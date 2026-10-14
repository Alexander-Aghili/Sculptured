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

### The hosted gateway's macOS build

The gateway image builds Linux and Windows itself, but macOS needs a Mac. `.github/workflows/mac.yml` builds on GitHub's Apple silicon Macs on every push to main (free for public repositories) and replaces the files of the `mac-latest` release:
- `sculptured-aarch64-apple-darwin.tar.gz`, `.sha256` and `.commit`: the runner. The server's update timer (sculptured-cloud's `update.sh`) takes it once `.commit` is the commit it runs, checks the checksum, and serves it from `/data/releases`.
- `Sculptured-mac-arm64.dmg`: the desktop app, linked from the Computers page (`GATEWAY_MAC_APP_URL`). It's signed ad hoc, so macOS asks once before it opens; a Developer ID and notarization would remove that.

If GitHub can't build it, build on a Mac and upload by hand:

```sh
git fetch && git checkout origin/main
deploy/release/build-mac.sh dist                                   # on the Mac
deploy/aws/deploy.sh --upload-release <folder with dist/*>         # in sculptured-cloud
```

Each deploy (and `deploy.sh --release-status`) warns when an uploaded build is from another commit.

**The desktop app's installers** are built on each OS with `cd desktop && npm ci && npx electron-builder` (see `desktop/README.md`).

## Later

These are deferred:
- Windows builds and `install.ps1`;
- the desktop installers in CI;
- a universal macOS dmg;
- code signing (Apple Developer ID and notarization; a Windows certificate);
- CI on every push.

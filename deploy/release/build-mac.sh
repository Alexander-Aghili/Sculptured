#!/bin/sh
# On an Apple silicon Mac: builds the runner for macOS from this checkout's commit and packages it,
# with a note of that commit, for the hosted gateway (sculptured-cloud's deploy.sh --upload-release).
#   deploy/release/build-mac.sh [outdir]      (default: dist)
# Build the commit the server runs: git fetch && git checkout origin/main first.
set -eu
die() { echo "build-mac: $*" >&2; exit 1; }
[ "$(uname -s)-$(uname -m)" = Darwin-arm64 ] || die "run this on an Apple silicon Mac"
command -v cargo >/dev/null || die "install Rust first: https://rustup.rs"
cd "$(dirname "$0")/../.."
[ -z "$(git status --porcelain)" ] || die "commit or stash your changes first, so the build matches a commit"
out=${1:-dist}
# The oldest macOS the build runs on (Big Sur, the first for Apple silicon).
export MACOSX_DEPLOYMENT_TARGET=${MACOSX_DEPLOYMENT_TARGET:-11.0}
cargo build --locked --release -p sculptured
sh deploy/release/package.sh aarch64-apple-darwin target/release/sculptured "$out" >/dev/null
git rev-parse HEAD > "$out/sculptured-aarch64-apple-darwin.commit"
echo "built $(git rev-parse --short HEAD) into $out:"
ls "$out"/sculptured-aarch64-apple-darwin.*

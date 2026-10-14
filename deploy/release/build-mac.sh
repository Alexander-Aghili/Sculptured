#!/bin/sh
# On an Apple silicon Mac: builds the runner for Apple silicon and Intel Macs from this checkout's
# commit and packages each, with a note of that commit, for the hosted gateway (sculptured-cloud's
# deploy.sh --upload-release). target/release/sculptured ends up a universal program (both in one),
# which the desktop app bundles.
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
rustup target add x86_64-apple-darwin >/dev/null
cargo build --locked --release -p sculptured
cargo build --locked --release -p sculptured --target x86_64-apple-darwin
sh deploy/release/package.sh aarch64-apple-darwin target/release/sculptured "$out" >/dev/null
sh deploy/release/package.sh x86_64-apple-darwin target/x86_64-apple-darwin/release/sculptured "$out" >/dev/null
for t in aarch64-apple-darwin x86_64-apple-darwin; do git rev-parse HEAD > "$out/sculptured-$t.commit"; done
lipo -create target/release/sculptured target/x86_64-apple-darwin/release/sculptured -output target/release/sculptured.universal
mv target/release/sculptured.universal target/release/sculptured
echo "built $(git rev-parse --short HEAD) into $out:"
ls "$out"/sculptured-*-apple-darwin.*

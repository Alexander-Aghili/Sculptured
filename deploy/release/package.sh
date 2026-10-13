#!/bin/sh
# Packages a `sculptured` binary for a release: sculptured-<target>.tar.gz and its .sha256.
#   deploy/release/package.sh <target> <path/to/sculptured> <outdir>
set -eu
target=$1; binary=$2; out=$3
mkdir -p "$out"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp "$binary" "$stage/sculptured"
chmod 755 "$stage/sculptured"
asset="sculptured-$target.tar.gz"
tar -czf "$out/$asset" -C "$stage" sculptured
if command -v sha256sum >/dev/null 2>&1; then sum=$(sha256sum "$out/$asset" | cut -d' ' -f1)
else sum=$(shasum -a 256 "$out/$asset" | cut -d' ' -f1); fi
printf '%s  %s\n' "$sum" "$asset" > "$out/$asset.sha256"
echo "$out/$asset"

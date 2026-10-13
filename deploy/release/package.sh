#!/bin/sh
# Packages a `sculptured` binary for a release: sculptured-<target>.tar.gz and its .sha256.
#   deploy/release/package.sh <target> <path/to/sculptured> <outdir>
# A Windows target (…-windows-…) packs sculptured.exe and, next to it, sculptured-background.exe (the
# window-less launcher its logon task runs). Windows 10 and later unpack .tar.gz with their own tar.
set -eu
target=$1; binary=$2; out=$3
mkdir -p "$out"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
case "$target" in
  *windows*)
    cp "$binary" "$stage/sculptured.exe"
    cp "$(dirname "$binary")/sculptured-background.exe" "$stage/sculptured-background.exe"
    files="sculptured.exe sculptured-background.exe" ;;
  *)
    cp "$binary" "$stage/sculptured"
    chmod 755 "$stage/sculptured"
    files=sculptured ;;
esac
asset="sculptured-$target.tar.gz"
# shellcheck disable=SC2086 # $files is a list of names
tar -czf "$out/$asset" -C "$stage" $files
if command -v sha256sum >/dev/null 2>&1; then sum=$(sha256sum "$out/$asset" | cut -d' ' -f1)
else sum=$(shasum -a 256 "$out/$asset" | cut -d' ' -f1); fi
printf '%s  %s\n' "$sum" "$asset" > "$out/$asset.sha256"
echo "$out/$asset"

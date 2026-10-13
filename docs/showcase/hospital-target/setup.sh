#!/usr/bin/env bash
# Copies this sample project to a folder and makes it a git repository with one commit on `main`.
# Usage: setup.sh [folder]   (default: $HOME/sculptured-hospital). No network access.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="${1:-$HOME/sculptured-hospital}"
if [ -e "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
  echo "$dest exists and is not empty; choose another folder." >&2
  exit 1
fi
mkdir -p "$dest"
cp -R "$here/package.json" "$here/ISSUES.md" "$here/src" "$here/test" "$dest/"
cd "$dest"
git init -q -b main
git add -A
git -c user.name="Sculptured showcase" -c user.email="showcase@localhost" commit -q -m "corner-shop: starting point for the coding-hospital showcase"
echo "Ready: $dest (branch main, $(git rev-list --count HEAD) commit). Run 'npm test' there; it passes with 8 todo tests."

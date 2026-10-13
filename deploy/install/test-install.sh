#!/bin/sh
# Tests install.sh against a local, file:// release built by deploy/release/package.sh around a
# fake `sculptured` that records how it was run. No network; nothing outside a temp folder.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=x86_64-unknown-linux-gnu ;;
  Linux-aarch64 | Linux-arm64) target=aarch64-unknown-linux-gnu ;;
  Darwin-x86_64) target=x86_64-apple-darwin ;;
  Darwin-arm64) target=aarch64-apple-darwin ;;
  *) echo "skip: no test target for this machine"; exit 0 ;;
esac

mkdir -p "$work/bin" "$work/rel"
cat > "$work/bin/sculptured" <<'X'
#!/bin/sh
echo "ran: $*" > "$HOME/ran.txt"
X
chmod +x "$work/bin/sculptured"
sh "$repo/deploy/release/package.sh" "$target" "$work/bin/sculptured" "$work/rel"

render() { sed -e "s#__ORIGIN__#https://app.test#" -e "s#__RELEASES__#file://$work/rel#" "$repo/deploy/install/install.sh" > "$work/install.sh"; }
render

# 1. Installs and connects.
HOME="$work/h1" sh "$work/install.sh" --allow X > "$work/out1" 2>&1 || { cat "$work/out1"; fail "install failed"; }
[ -x "$work/h1/.local/bin/sculptured" ] || fail "not installed"
[ "$(cat "$work/h1/ran.txt")" = "ran: connect https://app.test --install-service --allow X" ] || fail "connect (as a background service) not run as expected: $(cat "$work/h1/ran.txt")"

# 2. A changed checksum stops everything.
cp "$work/rel/sculptured-$target.tar.gz.sha256" "$work/good.sha256"
printf '%064d  %s\n' 0 "sculptured-$target.tar.gz" > "$work/rel/sculptured-$target.tar.gz.sha256"
if HOME="$work/h2" sh "$work/install.sh" > "$work/out2" 2>&1; then fail "a bad checksum was accepted"; fi
grep -q "checksum mismatch" "$work/out2" || { cat "$work/out2"; fail "no checksum message"; }
[ ! -e "$work/h2/.local/bin/sculptured" ] || fail "installed despite a bad checksum"

# 3. An unknown architecture stops with a message.
mkdir -p "$work/shim"
printf '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo riscv128;; esac\n' > "$work/shim/uname"
chmod +x "$work/shim/uname"
if HOME="$work/h3" PATH="$work/shim:$PATH" sh "$work/install.sh" > "$work/out3" 2>&1; then fail "an unknown arch was accepted"; fi
grep -q "unsupported" "$work/out3" || { cat "$work/out3"; fail "no unsupported message"; }

cp "$work/good.sha256" "$work/rel/sculptured-$target.tar.gz.sha256"

# 4. A Rosetta shell on Apple silicon (uname -m says x86_64) gets the Apple-silicon build.
sh "$repo/deploy/release/package.sh" aarch64-apple-darwin "$work/bin/sculptured" "$work/rel" > /dev/null
mkdir -p "$work/mac"
printf '#!/bin/sh\ncase "$1" in -s) echo Darwin;; -m) echo x86_64;; esac\n' > "$work/mac/uname"
printf '#!/bin/sh\n[ "$2" = sysctl.proc_translated ] && echo "$TRANSLATED"\n' > "$work/mac/sysctl"
chmod +x "$work/mac/uname" "$work/mac/sysctl"
HOME="$work/h4" TRANSLATED=1 PATH="$work/mac:$PATH" sh "$work/install.sh" > "$work/out4" 2>&1 || { cat "$work/out4"; fail "Rosetta shell did not install"; }
[ -x "$work/h4/.local/bin/sculptured" ] || fail "Rosetta shell: not installed"

# 5. An Intel Mac stops with a clear message until its build ships.
if HOME="$work/h5" TRANSLATED=0 PATH="$work/mac:$PATH" sh "$work/install.sh" > "$work/out5" 2>&1; then fail "an Intel Mac was accepted"; fi
grep -q "Intel Macs aren't supported yet" "$work/out5" || { cat "$work/out5"; fail "no Intel message"; }

echo "install.sh: all checks passed"

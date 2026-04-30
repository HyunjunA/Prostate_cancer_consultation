#!/usr/bin/env bash
# install-hooks.sh — copy tracked hook scripts from scripts/hooks/ into .git/hooks/.
#
# Why:
#   .git/hooks/ is per-clone (git does not track it), so a hook checked
#   into the repo cannot install itself. This script bridges that gap —
#   run it once after cloning, or after pulling new hook updates.
#
# Usage (from anywhere inside the repo):
#   bash scripts/install-hooks.sh
#
# What it does:
#   For each file in scripts/hooks/, copy it to .git/hooks/<name> and
#   make it executable. If a hook with the same name already exists in
#   .git/hooks/ (typical: git-lfs's auto-generated pre-push), back it
#   up to <name>.bak before overwriting — the new hook preserves the
#   git-lfs behavior anyway.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SRC_DIR="$REPO_ROOT/scripts/hooks"
HOOK_DST_DIR="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOK_SRC_DIR" ]; then
    echo "✗ $HOOK_SRC_DIR not found — are you running this from inside the repo?" >&2
    exit 1
fi

if [ ! -d "$HOOK_DST_DIR" ]; then
    echo "✗ $HOOK_DST_DIR not found — is this directory a git repo?" >&2
    exit 1
fi

echo "Installing hooks from $HOOK_SRC_DIR → $HOOK_DST_DIR"
echo ""

INSTALLED=0
for src in "$HOOK_SRC_DIR"/*; do
    [ -f "$src" ] || continue
    name="$(basename "$src")"
    dst="$HOOK_DST_DIR/$name"

    # Back up an existing hook (git-lfs auto-installs a pre-push, etc.)
    if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
        cp "$dst" "${dst}.bak"
        echo "  ⚠ existing $name backed up to $name.bak"
    fi

    cp "$src" "$dst"
    chmod +x "$dst"
    echo "  ✓ installed: $name"
    INSTALLED=$((INSTALLED + 1))
done

echo ""
if [ "$INSTALLED" -eq 0 ]; then
    echo "  (no hooks found in $HOOK_SRC_DIR)"
else
    echo "Done — $INSTALLED hook(s) installed."
    echo "Bypass any hook for one push:  git push --no-verify"
fi

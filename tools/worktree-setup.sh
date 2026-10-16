#!/bin/sh
#
# Makes a new git worktree of this repository usable straight away. Both
# worktrunk (.config/wt.toml pre-start) and Orca (orca.yaml scripts.setup)
# call this, so every worktree gets the same setup however it was created.
# Safe to re-run: existing paths are never replaced, and a repeat install is
# a no-op.
#
# Usage: sh tools/worktree-setup.sh
#
# Run from anywhere inside the worktree. It finds the primary checkout
# itself, so no tool-specific environment variable is needed. Beads needs
# nothing here: bd finds the shared database through the git common dir.

set -e

cd "$(git rev-parse --show-toplevel)"

# The first `git worktree list` entry is the main worktree. For a bare
# repository, or one made with --separate-git-dir, that entry is the
# metadata directory rather than a checkout, so trust it only if it is its
# own work tree; otherwise link nothing rather than guess. The -n test
# matters because `git -C ""` means the current directory, and the
# rev-parse failure is expected for a bare repo, hence the discarded stderr.
primary=
candidate=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
if [ -n "$candidate" ] &&
    top=$(git -C "$candidate" rev-parse --show-toplevel 2>/dev/null) &&
    [ "$(cd "$top" && pwd -P)" = "$(cd "$candidate" && pwd -P)" ]; then
    primary=$candidate
fi

# Agent skill installs, ignored through .git/info/exclude (shared by every
# worktree). Linking to the primary's copies keeps one install to update.
LOCAL_PATHS=".agents/skills/beads .claude/skills/beads"

if [ -z "$primary" ]; then
    echo "worktree setup: no primary checkout (bare repository or separate git dir); skipped linking."
elif [ "$(pwd -P)" = "$(cd "$primary" && pwd -P)" ]; then
    echo "worktree setup: in the primary checkout; skipped linking."
else
    for path in $LOCAL_PATHS; do
        # A dangling link fails -e, so -L stops ln from aborting a re-run
        # under set -e after the primary's copy was removed.
        if [ -e "$path" ] || [ -L "$path" ]; then
            echo "worktree setup: $path already present; left untouched."
        elif [ -e "$primary/$path" ]; then
            mkdir -p "$(dirname "$path")"
            ln -s "$primary/$path" "$path"
            echo "worktree setup: linked $path from the primary checkout."
        else
            echo "worktree setup: no $path in the primary checkout; skipped."
        fi
    done
fi

# `npm install` rather than `npm ci`: ci deletes node_modules on every run,
# so a re-run would reinstall everything.
npm install

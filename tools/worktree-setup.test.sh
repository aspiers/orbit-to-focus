#!/bin/sh
#
# Tests tools/worktree-setup.sh against real throwaway repositories, with
# npm stubbed out. Usage: sh tools/worktree-setup.test.sh

set -eu

script=$(cd "$(dirname "$0")" && pwd -P)/worktree-setup.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failures=0

# The stub exits with $NPM_STATUS, so the test can check the pass-through.
mkdir "$tmp/bin"
printf '#!/bin/sh\nexit "${NPM_STATUS:-0}"\n' >"$tmp/bin/npm"
chmod +x "$tmp/bin/npm"
PATH="$tmp/bin:$PATH"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git() { command git -c user.name=t -c user.email=t@t -c init.defaultBranch=main "$@"; }

check() {
    if eval "$2"; then echo "ok: $1"; else echo "FAIL: $1"; failures=$((failures + 1)); fi
}

run() { (cd "$1" && sh "$script") >"$tmp/out" 2>&1; }

# A primary checkout with a committed file, a worktree of it, and the first
# skill directory present in the primary only.
git init -q "$tmp/p"
touch "$tmp/p/README"
git -C "$tmp/p" add README
git -C "$tmp/p" commit -qm init
mkdir -p "$tmp/p/.agents/skills/beads"
git -C "$tmp/p" worktree add -q "$tmp/w" -b w

mkdir "$tmp/w/sub"
run "$tmp/w/sub"
check "links a path missing from the worktree, run from a subdirectory" \
    '[ "$(readlink "$tmp/w/.agents/skills/beads")" = "$tmp/p/.agents/skills/beads" ]'
check "skips a path missing from the primary" \
    '[ ! -e "$tmp/w/.claude/skills/beads" ] && grep -q "no .claude/skills/beads" "$tmp/out"'

check "re-runs are harmless" 'run "$tmp/w" && grep -q "already present" "$tmp/out"'

rm "$tmp/w/.agents/skills/beads"
mkdir "$tmp/w/.agents/skills/beads"
mkdir -p "$tmp/w/.claude/skills"
ln -s "$tmp/gone" "$tmp/w/.claude/skills/beads"
mkdir -p "$tmp/p/.claude/skills/beads"
run "$tmp/w"
check "never replaces an existing directory" '[ ! -L "$tmp/w/.agents/skills/beads" ]'
check "never replaces a dangling link" \
    '[ "$(readlink "$tmp/w/.claude/skills/beads")" = "$tmp/gone" ]'

rm -r "$tmp/p/.claude"
run "$tmp/p"
check "skips linking in the primary checkout" \
    'grep -q "in the primary checkout" "$tmp/out" && [ ! -e "$tmp/p/.claude" ]'

check "passes the install's exit code through" \
    '(export NPM_STATUS=3; run "$tmp/w"); [ $? -eq 3 ]'

# Bare and --separate-git-dir repositories: the first worktree entry is not
# a checkout, so a path planted beside the metadata must never be linked.
git clone -q --bare "$tmp/p" "$tmp/b/project.git"
mkdir -p "$tmp/b/.agents/skills/beads"
git -C "$tmp/b/project.git" worktree add -q "$tmp/bw" -b bw
run "$tmp/bw"
check "finds no primary for a worktree of a bare repo" \
    '[ ! -e "$tmp/bw/.agents" ] && grep -q "no primary checkout" "$tmp/out"'

git init -q --separate-git-dir "$tmp/s/meta" "$tmp/s/checkout"
git -C "$tmp/s/checkout" commit -q --allow-empty -m init
mkdir -p "$tmp/s/.agents/skills/beads"
git -C "$tmp/s/checkout" worktree add -q "$tmp/sw" -b sw
run "$tmp/sw"
check "finds no primary for a worktree of a --separate-git-dir checkout" \
    '[ ! -e "$tmp/sw/.agents" ] && grep -q "no primary checkout" "$tmp/out"'

[ "$failures" -eq 0 ] || { echo "$failures failed"; exit 1; }

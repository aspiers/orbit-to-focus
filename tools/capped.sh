#!/bin/sh
# Runs a command on at most half the machine's CPU time, so tests and builds leave the rest free.
# Where systemd user scopes aren't available (Vercel's build, containers) it runs the command uncapped.
# --expand-environment=no stops systemd-run rewriting $ in the command's arguments.
scope="systemd-run --user --scope --quiet --expand-environment=no"
if $scope -p CPUQuota=1% true 2>/dev/null; then
  exec $scope -p CPUQuota="$(($(nproc) * 50))%" -- "$@"
fi
exec "$@"

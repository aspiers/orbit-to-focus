#!/bin/sh
# Runs the Playwright tests under the CPU cap, one run at a time across every checkout on this machine.
# Runs share port 5182, the GPU and the frame-rate tests' timing, so a second run queues here on a lock
# instead of failing on the port or skewing the first run's timings. Arguments go to `playwright test`.
lock="${XDG_RUNTIME_DIR:-/tmp}/orbit-to-focus-e2e.lock"
exec 9>"$lock"
if ! flock -n 9; then
  echo "e2e.sh: waiting for another checkout's e2e run to finish" >&2
  flock -w 900 9 || { echo "e2e.sh: gave up after 15 minutes; $lock is still held" >&2; exit 75; }
fi
exec sh tools/capped.sh npx playwright test "$@"

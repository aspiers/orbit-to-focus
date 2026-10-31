# Orbit to Focus

A single-page web app that teaches astronomy spatially: from the solar
system down through the Earth, your site and a telescope to its optics. See
`README.md` for what it does.

## Stack

- Vite, React 18 and TypeScript for the UI (`src/components/`).
- three.js driven imperatively for the 3D scene (`src/scene/`), not React
  Three Fiber. React and the scene share state through the small stores in
  `src/store.ts`.
- `src/optics.ts` is a 2D ray tracer; `src/astro.ts` holds the astronomy.

## Commands

- `npm run dev`: development server.
- `npm run typecheck`: TypeScript only.
- `npm test`: both test layers below. Run it before every commit that
  changes `src/`.
- `npm run test:unit`: Vitest in Node (`tests/unit/`): astronomy, optics,
  address-bar encoding, time controls and guide data. Takes about a second;
  run it after any change to `src/astro.ts`, `src/optics.ts`, `src/url.ts`,
  `src/time.ts` or `src/lessons.tsx`.
- `npm run test:e2e`: builds `dist-e2e/` with `vite build --mode e2e`, serves
  it on port 5182 and runs the Playwright tests (`tests/e2e/`) in
  `/usr/bin/chromium` on the GPU. Takes about a minute. To run one test, use
  `sh tools/capped.sh npx playwright test -g '<name>'` once `dist-e2e/`
  exists; `npm run build` leaves it alone.
- `npm run build`: typecheck, then a single-file build in `dist/`
  (`dist/orbit-to-focus.html` is the publishable artifact).

## Machine load

Work on this project must take no more than half the machine's CPU or GPU.

- `npm test`, `npm run test:unit` and `npm run test:e2e` run under
  `tools/capped.sh`, a systemd user scope capped at half the cores. Run
  other heavy commands through it too, such as a single Playwright test or a
  `vite build`.
- Run one browser on the app at a time, and close any browser or dev server
  you start as soon as you are done: an open page keeps rendering the 3D
  scene. Never leave a headless browser on the app, since without the GPU it
  renders in software on the CPU.

## Tests

- Browser tests read numbers, not pixels, from `window.__otf`, which
  `src/testHook.ts` fills only in the e2e build: each rendered frame's
  camera position, direction, up, field of view, and the telescope's and
  the Earth's screen positions. It hooks three.js from outside
  `src/scene/Scene.ts`.
- Playwright uses the system Chromium; never download browsers. The tests
  fix `Date` (not timers) to 2026-10-16 20:00 UTC so the sky is the same on
  every run.
- A test that guards a fix should fail without it. To check, build the fix's
  parent in `tmp/` (`git archive <sha>^ | tar -x -C tmp/old`, link
  `node_modules`, copy in `src/testHook.ts` and import it from
  `src/main.tsx`, then `vite build --mode e2e --outDir dist-e2e`) and run
  the test with `E2E_DIST=tmp/old/dist-e2e`.

## Worktrees

`tools/worktree-setup.sh` makes a new worktree usable: it links the
gitignored Beads skill installs (`.agents/skills/beads`,
`.claude/skills/beads`) from the main checkout and runs `npm install`.
worktrunk's `.config/wt.toml` pre-start hook and Orca's `orca.yaml` call it.
After a plain `git worktree add`, run `sh tools/worktree-setup.sh` in the
new worktree. Test changes to it with `sh tools/worktree-setup.test.sh`.

## Conventions

- Follow `.editorconfig`; no trailing whitespace.
- Keep the app usable by owners of any telescope: the Seestar S50 Pro is
  only the default, so guide text and UI must not assume it.
- Every guide step that suggests changing an option also names its keyboard
  shortcut (see `src/components/Shortcuts.tsx`).
- Put temporary files in `tmp/`, which is ignored.

## Beads Solo

Before running any `bd` command, load the `beads-solo` (policy), `beads`
(workflow) and `beads-best-practices` (issue writing and updates) skills.

This repository opts into the Beads **team-maintainer** profile for issue
management and commits. Unless a current user or orchestrator instruction
says otherwise, agents may manage issues and make atomic commits as work
progresses. They must not push Git branches or sync or push Dolt state
unless explicitly requested.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates and commit as part of session close; in this repository they never push unless the user explicitly asks. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer (this repository): commit atomically, but never pull,
   # push or sync unless the user explicitly asks.
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

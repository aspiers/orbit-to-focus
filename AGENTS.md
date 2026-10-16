# Orbit to Eyepiece

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
- `npm run check`: the self-checks in `tools/selfcheck.ts` (astronomy,
  optics, address-bar encoding). Run after any change to `src/astro.ts`,
  `src/optics.ts` or `src/url.ts`.
- `npm run build`: typecheck, then a single-file build in `dist/`
  (`dist/orbit-to-eyepiece.html` is the publishable artifact).

## Conventions

- Follow `.editorconfig`; no trailing whitespace.
- Keep the app usable by owners of any telescope: the Seestar S50 Pro is
  only the default, so guide text and UI must not assume it.
- Every guide step that suggests changing an option also names its keyboard
  shortcut (see `src/components/Shortcuts.tsx`).
- Put temporary files in `tmp/`, which is ignored.

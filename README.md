# Orbit to Eyepiece

An interactive 3D explainer for new astronomers: zoom continuously from Earth's orbit round the Sun,
through the Earth, Moon and celestial sphere, down to a Seestar S50 Pro on its tripod and the light
rays focusing inside it. Guided lessons cover the ecliptic, axial tilt, RA/Dec, alt-az, the meridian,
why a polar axis tilts by your latitude, equatorial mode, tracking, aperture, focal length, f-numbers,
and four other telescope designs (Petzval, refractor, Newtonian, Schmidt-Cassegrain).

TypeScript + React for the interface, three.js for the scene, built with Vite into one HTML file.

- `npm run dev` serves it locally with hot reload.
- `npm run build` type-checks and writes `dist/index.html` (open it directly) and
  `dist/orbit-to-eyepiece.html` (the artifact body).
- `npm run check` checks the astronomy and optics maths (`tools/selfcheck.ts`).
- `npm run data` regenerates `src/data.ts` from d3-celestial and world-atlas downloads in `tmp/data/`.

Layout: `src/scene/` is the 3D scene (`Scene.ts` orchestrates; models, textures and helpers beside it),
`src/components/` the React panels, `src/lessons.tsx` the guided tour, `src/optics.ts` the ray tracer,
`src/astro.ts` the astronomy.

Append `#lesson11` (any number) to the URL to open a lesson directly.

# Orbit to Focus

An interactive 3D explainer for new astronomers: zoom continuously from Earth's orbit round the Sun,
through the Earth, Moon and celestial sphere, down to a telescope on its mount and the light rays
focusing inside it. A Seestar S50 Pro is the default; any of the designs can be chosen, and the camera
refractor's focal length, aperture and sensor can be set to match your own. Guided lessons cover the ecliptic, axial tilt, RA/Dec, alt-az, the meridian,
why a polar axis tilts by your latitude, equatorial mode, tracking, aperture, focal length, f-numbers,
and other telescope designs (Petzval, refractor, Newtonian, Dobsonian, Schmidt-Cassegrain).

Try it at <https://orbit-to-focus.space>.

It's an alpha. If something is wrong, especially in the astronomy or optics, please
[open an issue](https://github.com/aspiers/orbit-to-focus/issues/new/choose).

TypeScript + React for the interface, three.js for the scene, built with Vite into one HTML file.

- `npm run dev` serves it locally with hot reload.
- `npm run build` type-checks and writes `dist/index.html` (open it directly) and
  `dist/orbit-to-focus.html` (the artifact body).
- `npm test` runs the unit tests (`tests/unit/`, Vitest) and the browser tests (`tests/e2e/`, Playwright in
  the system Chromium).
- `npm run data` regenerates `src/data.ts` from d3-celestial and world-atlas downloads in `tmp/data/`.

Layout: `src/scene/` is the 3D scene (`Scene.ts` orchestrates; models, textures and helpers beside it),
`src/components/` the React panels, `src/lessons.tsx` the guided tour, `src/optics.ts` the ray tracer,
`src/astro.ts` the astronomy.

Append `#lesson11` (any number) to the URL to open a lesson directly.

The app starts at Greenwich Observatory and asks the browser for your location, rounded to a tenth of a degree.
An address that already carries `loc=` keeps its place and doesn't ask.
Copy link (key `U`; in the time bar's `⋯` menu on phones) copies the view's address without `loc=`, so a
shared link doesn't give away where you are and opens at the receiver's own place.

## Licence

Copyright Adam Spiers. Licensed under the GNU Affero General Public License v3.0; see `LICENSE`.
Star data comes from d3-celestial (BSD-3-Clause) and coastlines from Natural Earth via world-atlas (public domain, ISC).

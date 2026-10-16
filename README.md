# Orbit to Eyepiece

An interactive 3D explainer for new astronomers: zoom continuously from Earth's orbit round the Sun,
through the Earth, Moon and celestial sphere, down to a Seestar S50 Pro on its tripod and the light
rays focusing inside it. Guided lessons cover the ecliptic, axial tilt, RA/Dec, alt-az, the meridian,
equatorial mode, tracking, aperture, focal length and f-numbers.

- `src/` holds the page (`page.html`), app (`app.js`), astronomy and ray-tracing maths, and embedded data.
- `node tools/build.mjs` writes `dist/index.html` (open it locally) and `dist/orbit-to-eyepiece.html` (artifact body).
- `node tools/selfcheck.mjs` checks the astronomy and optics maths.
- `tools/prep-data.mjs` regenerates `src/data.js` from d3-celestial and world-atlas downloads in `tmp/data/`.

Append `#lesson5` (any number) to the URL to open a lesson directly.

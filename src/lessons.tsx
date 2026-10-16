import type { ReactNode } from 'react';
import { TARGETS, type StopId } from './constants.ts';
import { settings, useStore, type Layers, type Settings } from './store.ts';
import type { TelescopeType } from './optics.ts';
import type { SceneApi } from './scene/Scene.ts';

const R2D = 180 / Math.PI;
const Lat = () => <b>{useStore(settings, (s) => (Math.abs(s.lat) * R2D).toFixed(1))}°</b>;

interface Lesson {
  title: string;
  body: ReactNode;
  view: { stop: StopId; yaw?: number; pitch?: number } | { eye: [number, number] } | 'meridianSlice';
  speed: number;
  layers?: Partial<Layers>;
  mountMode?: Settings['mountMode'];
  tracking?: boolean;
  target?: string;
  telescope?: TelescopeType;
  corrected?: boolean;
}

const MIN10 = 600, WEEK = 604800;

// Each lesson sets up the scene, then explains what to watch.
export const LESSONS: Lesson[] = [
  {
    title: 'Earth goes round the Sun', view: { stop: 'solar' }, speed: WEEK, layers: { ecl: true, moonOrbit: false, lat: false },
    body: <>
      <p>Earth takes a year to go once around the Sun. The flat plane of that orbit is the <b className="c-ecl">ecliptic plane</b>. All the planets orbit close to it, so it is the main reference plane of the solar system.</p>
      <p>Time is running at one week per second. Drag to look around; scroll or pinch to zoom.</p>
    </>,
  },
  {
    title: 'A tilted axis that keeps its direction', view: { stop: 'solar', yaw: 12, pitch: 12 }, speed: WEEK, layers: { ecl: true },
    body: <>
      <p>Earth spins around an <b>axis</b> tilted 23.4° from upright, relative to the ecliptic. The axis keeps pointing the same way in space all year, at a spot very close to Polaris.</p>
      <p>Around the <b>June solstice</b> the north end leans toward the Sun: northern summer. Six months later it leans away. At the two <b>equinoxes</b> it leans sideways and day and night are equal everywhere.</p>
    </>,
  },
  {
    title: 'The Moon', view: { stop: 'moon' }, speed: MIN10, layers: { moonOrbit: true, eq: false },
    body: <>
      <p>The <b className="c-moon">Moon</b> orbits Earth every 27.3 days, in the same direction that Earth spins. Its orbit is tilted about 5° to the ecliptic, which is why we don’t get an eclipse every month.</p>
      <p>The Moon turns exactly once per orbit, so the same face (with its dark patches) always points at Earth. The Sun always lights half of it; the <b>phase</b> is how much of that lit half faces us.</p>
      <p>At 10 minutes per second the Moon creeps; set the speed to 1 day per second in the top bar (or press <kbd>]</kbd> three times) to watch a whole orbit in under half a minute.</p>
    </>,
  },
  {
    title: 'Earth spins under the sky', view: { stop: 'earth' }, speed: MIN10, layers: { eq: false, ecl: false, mer: false, hor: true },
    body: <>
      <p>Earth turns once on its axis relative to the stars every <b>23 h 56 min</b> (a sidereal day). Relative to the Sun it takes 24 h, because Earth also moves a little along its orbit each day and has to turn a bit further to face the Sun again.</p>
      <p>The gold dot is you, with your <b className="c-hor">horizon</b> drawn as a flat green plane. Earth turns west to east, so the whole sky appears to turn east to west.</p>
    </>,
  },
  {
    title: 'The celestial sphere', view: { stop: 'earth' }, speed: MIN10, layers: { eq: true, ecl: false, mer: false, hor: true },
    body: <>
      <p>Stars are so far away that they all look like points on a huge sphere centred on Earth. Extend Earth’s axis out to it and you get the <b className="c-eq">celestial poles</b>. Extend the equator and you get the <b className="c-eq">celestial equator</b>.</p>
      <p>The blue grid is the <b>equatorial coordinate system</b>. <b>Declination</b> (Dec) is latitude on the sky: +90° at the north celestial pole. <b>Right ascension</b> (RA) is longitude on the sky, counted in hours (0–24 h) eastward from the point where the Sun crosses the equator in March.</p>
      <p>This grid is fixed to the stars, not to Earth. Earth turns inside it, so a star’s RA and Dec stay the same all night and all year.</p>
    </>,
  },
  {
    title: 'The ecliptic on the sky', view: { stop: 'earth' }, speed: MIN10, layers: { eq: true, ecl: true, mer: false },
    body: <>
      <p>Seen from Earth, the Sun creeps once around the sky each year against the background stars. Its path is the <b className="c-ecl">ecliptic</b>: the ecliptic plane seen edge-on from inside.</p>
      <p>It is tilted 23.4° to the celestial equator, for the same reason Earth’s axis is tilted. The Sun crosses the equator at the March and September equinoxes. The Moon and planets always stay close to the ecliptic.</p>
      <p>Speed time up to 1 day per second (press <kbd>]</kbd> three times) to watch the Sun’s dot slide along the orange line.</p>
    </>,
  },
  {
    title: 'Your horizon: altitude and azimuth', view: { stop: 'site' }, speed: MIN10, layers: { eq: false, ecl: false, hor: true, mer: false },
    body: <>
      <p>Zoom in to your site and Earth looks flat. You can only see the half of the sky above your <b className="c-hor">horizon</b>.</p>
      <p><b>Altitude</b> is the angle above the horizon: 0° at the horizon, 90° straight up at the <b>zenith</b>. <b>Azimuth</b> is the compass bearing, measured from north through east: 90° is east, 180° south, 270° west.</p>
      <p>The green grid is this <b>alt-az</b> system. It is fixed to you, not the stars, so a star’s altitude and azimuth keep changing through the night. Watch the numbers at the bottom of the screen.</p>
    </>,
  },
  {
    title: 'The meridian', view: { eye: [0, 30] }, speed: MIN10, layers: { eq: false, ecl: true, hor: true, mer: true },
    body: <>
      <p>You are now standing next to the telescope, facing south. The pink <b className="c-mer">meridian</b> runs from due north on the horizon, up through the zenith, and down to due south.</p>
      <p>Every star crosses it once a day. At that moment it <b>transits</b>: it is at its highest. The <b>hour angle</b> (HA) is how long ago a star crossed the meridian. <b>Local sidereal time</b> (LST) is the RA that is on the meridian right now, so HA = LST − RA.</p>
      <p>Drag to look around; scroll to zoom.</p>
    </>,
  },
  {
    title: 'The sky turns around the pole', view: { eye: [180, 36] }, speed: MIN10, target: 'Polaris', layers: { eq: true, ecl: false, hor: true, mer: true, con: true },
    body: <>
      <p>Face north and the sky turns around the <b className="c-eq">north celestial pole</b>, less than a degree from Polaris. The pole’s altitude always equals your latitude: <Lat /> here. The next lessons show why.</p>
      <p>Stars closer to the pole than that never set. They are <b>circumpolar</b>. Set the speed to 1 hour per second in the top bar (or press <kbd>]</kbd>) to see the turning clearly. Change your latitude under Sky &amp; place: at the equator the pole sits on the horizon, and at the North Pole it is overhead.</p>
    </>,
  },
  {
    title: 'Alt-az mode', view: { stop: 'scope' }, speed: MIN10, mountMode: 'altaz', target: 'Vega', tracking: true, telescope: 'seestar', corrected: true, layers: { hor: true, eq: false, mer: true, lat: false },
    body: <>
      <p>Many telescopes sit on an <b>alt-azimuth</b> (alt-az) mount: the base turns the telescope around the horizon (azimuth) and an arm tilts it up and down (altitude). The example here, a Seestar S50 Pro, works this way out of the box. The gold line shows where it is pointing.</p>
      <p>To follow a star, both axes must move, at speeds that keep changing: compare the two axis speeds on the Telescope tab. The picture in the camera also slowly rotates (<b>field rotation</b>), which is why alt-az mode limits how long each exposure can be.</p>
    </>,
  },
  {
    title: 'Why the tilt equals your latitude', view: 'meridianSlice', speed: 0, layers: { lat: true, eq: false, ecl: false, mer: false, hor: true },
    body: <>
      <p>Time is paused and Earth is cut through along your meridian, seen from the east. Two angles are marked, and they are always equal.</p>
      <p><b>At the centre:</b> your latitude, <Lat />, is the angle between the equator and the line out to you. That line carries on up to your <b className="c-hor">zenith</b>.</p>
      <p><b>At your feet:</b> your <b className="c-hor">horizon</b> is at right angles to your zenith, just as the equator is at right angles to Earth’s axis. Turn both lines of the first angle through a right angle and you get the second: a line parallel to Earth’s axis rises above your northern horizon by the same angle as your latitude.</p>
      <p>So to make a mount’s main axis parallel to Earth’s axis, you tilt it up from the northern horizon by your latitude. That is also why Polaris sits at an altitude equal to your latitude.</p>
    </>,
  },
  {
    title: 'Equatorial mode', view: { stop: 'scope' }, speed: MIN10, mountMode: 'eq', target: 'Vega', tracking: true, telescope: 'seestar', corrected: true, layers: { hor: true, eq: true, mer: true, lat: true },
    body: <>
      <p>An <b>equatorial</b> mount tilts its main axis (blue) until it is <b>parallel to Earth’s axis</b>, pointing at the celestial pole. Some mounts are built that way; an alt-az telescope like this one can be tilted on a wedge. As the last lesson showed, that axis rises above the northern horizon by your latitude: <Lat />.</p>
      <p>Here the turntable becomes the <b>RA axis</b> and the arm the <b>Dec axis</b>. To follow a star only the RA axis turns, at a steady 15° per hour (one turn per sidereal day), undoing Earth’s spin. The Dec axis stays still and the field no longer rotates. That is <b>equatorial mode</b>.</p>
    </>,
  },
  {
    title: 'What tracking does', view: { stop: 'scope' }, speed: 60, mountMode: 'eq', tracking: false, target: 'Vega', telescope: 'seestar', corrected: true, layers: { lat: false },
    body: <>
      <p>The purple box on the sky is the camera’s <b>field of view</b>: the patch of sky the telescope’s camera is photographing.</p>
      <p>Tracking is now off and time runs at one minute per second. The telescope stays still while Earth turns, so Vega drifts out of the box, by up to a quarter of a degree per minute (less near the pole). The <b>camera view</b> (bottom right) shows the same thing from the sensor’s side.</p>
      <p>Inside the tube the drift is tiny: a quarter of a degree moves the focus about 1 mm across the sensor. Tick <b>Track the target</b> on the Telescope tab (or press <kbd>K</kbd>) to bring Vega back.</p>
    </>,
  },
  {
    title: 'Inside a camera telescope', view: { stop: 'optics' }, speed: MIN10, telescope: 'seestar', corrected: true, tracking: true,
    body: <>
      <p>The example telescope, a Seestar S50 Pro, is a small <b>refractor</b>: a 50 mm lens at the front bends starlight so that it comes to a focus after travelling 260 mm, right on a camera sensor. There is no eyepiece; you see the sensor’s image on a phone or tablet. Many astrophotography setups work the same way, with an astronomy camera at the focus.</p>
      <p>The focal length is the distance the light travels, not how far the sensor is from the lens. The real S50 Pro folds that 260 mm path to fit its 170 mm optical unit, so its sensor sits closer to the lens than 260 mm. Folding doesn’t change the focal length. Here the path is drawn straightened out, so you can see its full length.</p>
      <p>Glass bends blue light more than red, so a single lens focuses each colour at a different distance. Two lenses made of different glasses, one of them extra-low-dispersion (ED) glass, can cancel that. ZWO’s lens has four elements; this model uses two with the same focal length.</p>
    </>,
  },
  {
    title: 'Aperture, focal length and f-number', view: { stop: 'optics' }, speed: MIN10, telescope: 'seestar', corrected: true, tracking: true,
    body: <>
      <p>Three numbers describe any telescope’s optics, and all three are drawn in gold. Here they are for the example Seestar.</p>
      <p><b>Aperture</b> (50 mm) is the diameter of the lens: the size of the bucket catching light. <b>Focal length</b> (260 mm) is how far the light travels after the lens before it comes to a focus. The <b>image sensor</b> sits exactly there.</p>
      <p>The <b>f-number</b> is simply focal length ÷ aperture: 260 ÷ 50 = f/5.2. It describes the shape of the cone of light: a low f-number is a short, fat cone that pours more light onto each pixel.</p>
      <p>Open the Telescope tab and drag the sliders, or set them to match your own telescope: watch the cone, the field of view (dashed purple) and the camera view change.</p>
    </>,
  },
  {
    title: 'Zoom in on the focus', view: { stop: 'focus' }, speed: MIN10, telescope: 'seestar', corrected: false, tracking: true,
    body: <>
      <p>This is the region around the focus, a few millimetres across. With a single plain lens, blue rays (bent most) cross the axis first and red rays last: <b>chromatic aberration</b>. Stars get coloured halos.</p>
      <p>Tick the ED doublet on the Telescope tab (or press <kbd>O</kbd>) and the colours land together on the sensor.</p>
    </>,
  },
  {
    title: 'Other designs: Petzval astrograph', view: { stop: 'optics' }, speed: MIN10, telescope: 'petzval', corrected: true, tracking: true,
    body: <>
      <p>A <b>Petzval</b> is a refractor with two lens groups: a front doublet that gathers the light and a rear doublet partway down the tube. The rear group shortens the focal length, here from 600 mm to about 400 mm (f/5), and corrects the images away from the centre so stars stay sharp right across a large camera sensor.</p>
      <p>That flat, sharp, fast field is why many astrophotography refractors are Petzvals. This one has an APS-C sensor at its focus. Untick the doublets (or press <kbd>O</kbd>) to see what single lenses would do to the colours.</p>
    </>,
  },
  {
    title: 'Other designs: Newtonian reflector', view: { stop: 'optics' }, speed: MIN10, telescope: 'newtonian', corrected: true, tracking: true,
    body: <>
      <p>A <b>Newtonian</b> collects light with a curved mirror at the bottom of the tube. A small flat mirror at 45° near the top sends the converging light out of the side to an eyepiece. Mirrors reflect every colour the same way, so there is no colour fringing.</p>
      <p>The main mirror must be a <b>paraboloid</b>. Untick it on the Telescope tab (or press <kbd>O</kbd>) to use a cheaper spherical mirror: the outer rays then focus short of the inner ones (<b>spherical aberration</b>).</p>
    </>,
  },
  {
    title: 'Other designs: Dobsonian', view: { stop: 'scope' }, speed: MIN10, telescope: 'dobsonian', mountMode: 'altaz', corrected: true, tracking: true, target: 'Vega',
    body: <>
      <p>A <b>Dobsonian</b> is a Newtonian on the simplest possible mount: a wooden <b>rocker box</b>. The box turns on a board on the ground (azimuth), and the tube tilts on two bearings in its sides (altitude). This one is 150 mm f/5, like a small tabletop Dobsonian.</p>
      <p>Without a motorised mount, the money goes into the mirror instead, so a Dobsonian gives the most aperture for the price. Most are pushed by hand to follow a star, which is fine for looking through an eyepiece but not for long camera exposures. Being alt-az, they can’t go on an equatorial wedge.</p>
    </>,
  },
  {
    title: 'Other designs: Schmidt-Cassegrain', view: { stop: 'optics' }, speed: MIN10, telescope: 'sct', corrected: true, tracking: true,
    body: <>
      <p>A <b>Schmidt-Cassegrain</b> folds a long focal length into a short tube. Light passes a thin <b>corrector plate</b>, bounces off a spherical main mirror, then off a small convex mirror that sends it back through a hole in the main mirror. The small mirror stretches the focal length about five times.</p>
      <p>Spherical mirrors are easy to make but blur the focus. The corrector plate’s subtle shape pre-bends each ray so they all meet. Untick it (or press <kbd>O</kbd>) to see the blur.</p>
    </>,
  },
  {
    title: 'The eyepiece and magnification', view: { stop: 'optics' }, speed: MIN10, telescope: 'refractor', corrected: true, tracking: true,
    body: <>
      <p>Visual telescopes end in an <b>eyepiece</b>: a small magnifier that turns the converging light back into a parallel beam for your eye.</p>
      <p>Magnification = telescope focal length ÷ eyepiece focal length. With the same 25 mm eyepiece this 600 mm refractor gives 24×, and the 2000 mm Schmidt-Cassegrain 80×. More magnification means a smaller patch of sky: compare the eyepiece view for each design.</p>
      <p>To finish, pick the design closest to your own telescope on the Telescope tab (or set the camera refractor’s focal length, aperture and sensor to match it) and explore freely.</p>
    </>,
  },
];

export function applyLesson(i: number, scene: SceneApi) {
  const l = LESSONS[i];
  const patch: Partial<Settings> = { lesson: i, speed: l.speed };
  if (l.speed) patch.lastSpeed = l.speed;
  if (l.layers) patch.layers = { ...settings.get().layers, ...l.layers };
  if (l.mountMode) patch.mountMode = l.mountMode;
  if (l.tracking !== undefined) patch.tracking = l.tracking;
  if (l.target) patch.target = TARGETS.findIndex((t) => t[0] === l.target);
  if (l.telescope) patch.telescope = l.telescope;
  if (l.corrected !== undefined) patch.corrected = l.corrected;
  settings.set(patch);
  if (l.view === 'meridianSlice') scene.faceSiteMeridian();
  else if ('eye' in l.view) scene.standHere(...l.view.eye);
  else scene.goTo(l.view.stop, { yaw: l.view.yaw, pitch: l.view.pitch });
}

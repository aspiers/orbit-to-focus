import * as THREE from 'three';
import { D2R, R2D, OBLIQUITY, gmst, sunEcliptic, moonEcliptic, eclipticToEquatorial, horizontal, sphToVec, wrapPi, type Horizontal } from '../astro.ts';
import { makeTelescope, type Telescope } from '../optics.ts';
import { DATA } from '../data.ts';
import { COLORS, LM, METRE, MOON_ORBIT_R, MOON_R, ORBIT_R, SHELL_R, SKY_R, STOPS, SUN_R, TARGETS, type StopId } from '../constants.ts';
import { settings, live, scopeInfo, type Settings } from '../store.ts';
import { V, vec, clamp, smooth, lerp, lineMat, polyline, circle, setAlpha, sphereGrid, altAzDir, bvColor } from './helpers.ts';
import { earthTexture, moonTexture, glowTexture, groundCap } from './textures.ts';
import { buildMount, type Mount } from './mount.ts';
import { buildScopeModel, scopeHalfWidth, type ScopeModel } from './telescope3d.ts';

export interface SceneApi {
  goTo(stop: StopId, opts?: { yaw?: number; pitch?: number }): void;
  standHere(yawDeg?: number, pitchDeg?: number): void;
  faceSiteMeridian(): void;
  setTime(ms: number): void;
  getTime(): number;
  setViewShift(dx: number, dy: number): void;
  dispose(): void;
}

interface Weights { L: number; sol: number; moon: number; earth: number; site: number; scope: number; opt: number }

export function createScene(canvas: HTMLCanvasElement, labelLayer: HTMLElement, eyeCanvas: HTMLCanvasElement): SceneApi {
  const S = () => settings.get();
  let time = Date.now();
  const cam = { L: 2.85, yaw: 0.6, pitch: 28 * D2R };
  const eye = { yaw: 0, pitch: 30 * D2R, fov: 70 };
  const axes = { a: 0, b: 0 };
  let tilt = 0, slewing = true;
  // A fly-to: L moves smoothly in log space; yaw and pitch are pulled toward their goals in the destination frame.
  // A `climb` zooms out over the first 60% of the time and turns over the last 55%, so it doesn't swing round while
  // skimming over the ground.
  let anim: { t: number; g: number; h: number; climb: boolean; dur: number; fromL: number; to: typeof cam } | null = null;
  let frameL = cam.L; // the zoom level that cam.yaw/pitch are currently expressed for
  // A set-piece view (the meridian slice) lifts the descent rules until the user zooms. `fr` eases in
  // and out so neither arriving nor leaving jolts, and is held off near the ground so the climb out is the
  // ordinary descent in reverse.
  let freeGoal = false, fr = 0;
  const pts = new Map<number, [number, number]>(); // pointers currently down on the canvas
  let shift = { dx: 0, dy: 0 };

  // ---------- renderer & scenes ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.autoClear = false;
  const scene = new THREE.Scene(), bgScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1e-9, 1e5);
  const bgCamera = new THREE.PerspectiveCamera(50, 1, 1, SKY_R * 3);

  // ---------- solar system ----------
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunGlow.scale.setScalar(SUN_R * 7);
  scene.add(sun, sunGlow, new THREE.PointLight(0xffffff, 3.2, 0, 0), new THREE.AmbientLight(0x8090b0, 0.4));

  const solarGroup = new THREE.Group();
  solarGroup.add(polyline(circle(ORBIT_R), lineMat(0x8fa0c8, 0.45)));
  const eclPlane = new THREE.Mesh(new THREE.RingGeometry(SUN_R * 1.5, ORBIT_R * 1.25, 96), new THREE.MeshBasicMaterial({ color: COLORS.ecl, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  eclPlane.rotation.x = -Math.PI / 2;
  solarGroup.add(eclPlane);
  const seasonMarks = ([['March equinox', 0], ['June solstice', 90], ['September equinox', 180], ['December solstice', 270]] as const).map(([name, lon]) => {
    const p = vec(sphToVec(lon * D2R, 0)).multiplyScalar(-ORBIT_R); // Earth sits opposite the Sun's direction
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x8fa0c8, transparent: true }));
    m.position.copy(p);
    solarGroup.add(m);
    return { name, p };
  });
  scene.add(solarGroup);

  // ---------- Earth system ----------
  const earthSys = new THREE.Group();     // at Earth's centre, ecliptic-aligned axes
  const tilt3 = new THREE.Group();        // equatorial frame fixed to the stars
  tilt3.rotation.x = -OBLIQUITY;
  const spin = new THREE.Group();         // rotates with the Earth
  tilt3.add(spin);
  earthSys.add(tilt3);
  scene.add(earthSys);
  const earthMat = new THREE.MeshPhongMaterial({ map: earthTexture(), shininess: 6, transparent: true });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), earthMat);
  spin.add(earth);
  const axisLine = polyline([V(0, -1.9, 0), V(0, 1.9, 0)], lineMat(COLORS.axis, 0.85));
  tilt3.add(axisLine);

  // Celestial sphere model around the Earth.
  const shell = new THREE.Group();
  const shellEq = sphereGrid(SHELL_R, 15, 30, COLORS.eq, 0.22, true);
  const shellPoles = polyline([V(0, -SHELL_R, 0), V(0, SHELL_R, 0)], lineMat(COLORS.eq, 0.35));
  shell.add(shellEq, shellPoles);
  tilt3.add(shell);
  const shellEcl = polyline(circle(SHELL_R), lineMat(COLORS.ecl, 0.9));
  earthSys.add(shellEcl);
  const shellSun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: COLORS.sun, transparent: true }));
  earthSys.add(shellSun);
  const shellTarget = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 24), new THREE.MeshBasicMaterial({ color: COLORS.brass, transparent: true, side: THREE.DoubleSide }));
  tilt3.add(shellTarget);

  // Moon and its orbit.
  const moon = new THREE.Group();
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 48, 24), new THREE.MeshPhongMaterial({ map: moonTexture(), shininess: 2, transparent: true }));
  moonMesh.rotation.y = -Math.PI / 2; // puts selenographic longitude 0 on +Z, which lookAt aims at Earth
  moon.add(moonMesh);
  earthSys.add(moon);
  let moonOrbit: THREE.Line | null = null, moonOrbitTime = -Infinity;
  function updateMoonOrbit() {
    if (Math.abs(time - moonOrbitTime) < 86400000) return;
    moonOrbitTime = time;
    const pts = Array.from({ length: 241 }, (_, i) => {
      const e = moonEcliptic(time + (i / 240) * 27.32 * 86400000);
      return vec(sphToVec(e.lon, e.lat)).multiplyScalar(MOON_ORBIT_R);
    });
    if (moonOrbit) { earthSys.remove(moonOrbit); moonOrbit.geometry.dispose(); }
    moonOrbit = polyline(pts, lineMat(COLORS.moon, 0.55));
    earthSys.add(moonOrbit);
  }

  // Site marker at Earth scale: local horizon plane and the meridian through the site.
  const siteBig = new THREE.Group();
  spin.add(siteBig);
  const horizonDisc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshBasicMaterial({ color: COLORS.hor, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  horizonDisc.rotation.x = -Math.PI / 2;
  const sitePin = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.brass, transparent: true }));
  siteBig.add(horizonDisc, polyline(circle(1.5, 96), lineMat(COLORS.hor, 0.7)), polyline([V(0, 0, 0), V(0, 1.6, 0)], lineMat(COLORS.hor, 0.9)));
  siteBig.add(sitePin);
  const meridianShell = new THREE.Group(); // great circle through the poles and the site's zenith
  meridianShell.add(polyline(circle(SHELL_R * 1.002, 256, (t) => V(Math.cos(t), Math.sin(t), 0).multiplyScalar(SHELL_R * 1.002)), lineMat(COLORS.mer, 0.8)));
  spin.add(meridianShell);

  // Why a polar axis tilts up by your latitude: a slice through the Earth along your meridian.
  // At the centre, latitude is the angle between the equator and you. At your feet the horizon is at right
  // angles to the vertical, so a line parallel to Earth's axis rises above the northern horizon by the same angle.
  const latDiagram = new THREE.Group();
  spin.add(latDiagram);
  const latPts = { centre: V(), site: V() };
  function arcPts(o: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const n = V().crossVectors(a, b).normalize(), ang = a.angleTo(b);
    return Array.from({ length: 33 }, (_, i) => a.clone().applyAxisAngle(n, (ang * i) / 32).multiplyScalar(r).add(o));
  }
  function buildLatDiagram(lat: number, lon: number) {
    latDiagram.clear();
    const u = vec(sphToVec(lon, lat)), e = vec(sphToVec(lon, 0)), axis = V(0, 1, 0);
    const north = V(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
    const seg = (a: THREE.Vector3, b: THREE.Vector3, color: number, op = 0.95) => latDiagram.add(polyline([a, b], lineMat(color, op)));
    latDiagram.add(polyline(circle(1, 128, (t) => e.clone().multiplyScalar(Math.cos(t)).addScaledVector(axis, Math.sin(t))), lineMat(0xc8d4ee, 0.8))); // Earth, cut through
    seg(axis.clone().multiplyScalar(-1.25), axis.clone().multiplyScalar(1.25), 0xffffff, 0.9); // Earth's axis
    seg(V(), e.clone().multiplyScalar(1.7), 0xffd678);                          // equator plane, toward your longitude
    seg(V(), u.clone().multiplyScalar(1.7), COLORS.hor);                        // centre -> you -> zenith
    seg(u, u.clone().addScaledVector(axis, 1.25), COLORS.eq);                   // the mount's polar axis
    seg(u.clone().addScaledVector(north, -0.5), u.clone().addScaledVector(north, 1.25), COLORS.hor, 0.7); // your horizon, N-S
    latDiagram.add(polyline(arcPts(V(), e, u, 0.42), lineMat(0xffffff, 1)));
    latDiagram.add(polyline(arcPts(u, north, axis, 0.42), lineMat(0xffffff, 1)));
    // Right-angle marks: the equator meets the axis, and the horizon meets the vertical.
    const sq = (o: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, k = 0.1) =>
      latDiagram.add(polyline([o.clone().addScaledVector(a, k), o.clone().addScaledVector(a, k).addScaledVector(b, k), o.clone().addScaledVector(b, k)], lineMat(0xffffff, 0.8)));
    sq(V(), e, axis); sq(u, north, u);
    latPts.centre.copy(e).add(u).normalize().multiplyScalar(0.55);
    latPts.site.copy(north).add(axis).normalize().multiplyScalar(0.55).add(u);
  }

  // ---------- the observing site (metres) ----------
  const site = new THREE.Group();
  site.scale.setScalar(METRE);
  spin.add(site);
  const ground = groundCap(1 / METRE);
  site.add(ground);
  const groundMat = ground.material as THREE.ShaderMaterial;
  site.add(new THREE.HemisphereLight(0xb8c6ff, 0x1a2418, 1.1));
  const mountHolder = new THREE.Group();
  site.add(mountHolder);
  const wedgeArc = new THREE.Group();
  site.add(wedgeArc);
  function buildWedgeArc(lat: number, headY: number) {
    wedgeArc.clear();
    const o = V(0, headY, 0), r = 0.3;
    const pts = Array.from({ length: 33 }, (_, i) => { const a = (lat * i) / 32; return V(0, Math.sin(a) * r, -Math.cos(a) * r).add(o); });
    wedgeArc.add(polyline(pts, lineMat(0xffffff, 1)));
    wedgeArc.add(polyline([o, o.clone().add(V(0, 0, -r * 1.6))], lineMat(COLORS.hor, 0.9)));
    wedgeArc.add(polyline([o, o.clone().add(V(0, Math.sin(lat), -Math.cos(lat)).multiplyScalar(r * 1.6))], lineMat(COLORS.eq, 0.9)));
  }
  // Camera frame for the side view of the optics: looking at the ray slice (the tube's y-z plane) from the
  // tube's -x side, away from the mount arm, the way you'd look at a telescope from beside it.
  const opticsFrame = new THREE.Object3D();
  opticsFrame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)));
  const pointer = polyline([V(0, 0, 0), V(0, 0, 4000)], lineMat(COLORS.brass, 0.55)); // the line of sight, out to "infinity"
  const polarRod = polyline([V(0, -0.1, 0), V(0, 0.45, 0)], lineMat(COLORS.eq, 0.9)); // axis A's direction
  let mount: Mount, scope: Telescope, model: ScopeModel;

  function buildScope() {
    const s = S();
    scope = makeTelescope(s.telescope, s.corrected, s.custom);
    if (mount) mountHolder.remove(mount.root);
    mount = buildMount(scope.seestarBody ? 'seestar' : 'generic', scopeHalfWidth(scope));
    mountHolder.add(mount.root);
    model = buildScopeModel(scope);
    model.group.position.copy(mount.scopeOffset);
    mount.axisB.add(model.group, opticsFrame, pointer);
    mount.axisA.add(polarRod);
    buildWedgeArc(s.lat, mount.wedge.position.y);
    scopeInfo.set({
      name: scope.name, aperture: scope.aperture, focalLength: scope.focalLength,
      nominalFocal: scope.type === 'seestar' ? s.custom.focal : Math.round(scope.focalLength / 10) * 10,
      sensor: scope.sensor, field: scope.field, magnification: scope.magnification, trueField: scope.trueField,
    });
  }

  // ---------- background sky (directions only, centred on the camera) ----------
  const eqToWorld = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -OBLIQUITY);
  const bgEq = new THREE.Group(); bgEq.quaternion.copy(eqToWorld); bgScene.add(bgEq);
  const bgSite = new THREE.Group(); bgScene.add(bgSite); // follows the observer's horizon frame
  const starVert = `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
    void main(){ vColor=color; gl_PointSize=size*scale; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const starFrag = `varying vec3 vColor; uniform float alpha;
    void main(){ float d=length(gl_PointCoord-0.5); gl_FragColor=vec4(vColor, smoothstep(0.5,0.1,d)*alpha); }`;
  function starPoints(radius: number, maxMag: number, sizeK: number) {
    const s = DATA.stars, pos: number[] = [], col: number[] = [], size: number[] = [];
    for (let i = 0; i < s.length; i += 4) {
      if (s[i + 2] > maxMag) continue;
      pos.push(...vec(sphToVec(s[i] * D2R, s[i + 1] * D2R)).multiplyScalar(radius).toArray());
      const c = bvColor(s[i + 3]);
      col.push(c.r, c.g, c.b);
      size.push(clamp((6.8 - s[i + 2]) * sizeK, 1.2, 9));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    return new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { scale: { value: 1 }, alpha: { value: 1 } }, vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false }));
  }
  const starDirs: [THREE.Vector3, number, number][] = [];
  for (let i = 0; i < DATA.stars.length; i += 4) starDirs.push([vec(sphToVec(DATA.stars[i] * D2R, DATA.stars[i + 1] * D2R)).applyQuaternion(eqToWorld), DATA.stars[i + 2], DATA.stars[i + 3]]);
  const bgStars = starPoints(SKY_R, 6.5, 1.25);
  bgEq.add(bgStars);
  const shellStars = starPoints(SHELL_R * 0.995, 4.2, 0.9);
  shell.add(shellStars);
  const conPts: THREE.Vector3[] = [];
  for (const l of DATA.lines) for (let i = 0; i < l.length - 2; i += 2)
    conPts.push(vec(sphToVec(l[i] * D2R, l[i + 1] * D2R)).multiplyScalar(SKY_R), vec(sphToVec(l[i + 2] * D2R, l[i + 3] * D2R)).multiplyScalar(SKY_R));
  const conLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(conPts), lineMat(0x7d8fc0, 0.32));
  bgEq.add(conLines);
  const bgEqGrid = sphereGrid(SKY_R, 15, 15, COLORS.eq, 0.3, true);
  bgEq.add(bgEqGrid);
  const bgEclLine = polyline(circle(SKY_R), lineMat(COLORS.ecl, 0.85));
  bgScene.add(bgEclLine);
  // Horizon frame: x east, y up, z south.
  const altazGrid = new THREE.Group();
  for (let alt = 10; alt < 90; alt += 10)
    altazGrid.add(polyline(circle(1, 128, (t) => V(Math.cos(t), 0, Math.sin(t)).multiplyScalar(Math.cos(alt * D2R) * SKY_R).setY(Math.sin(alt * D2R) * SKY_R)), lineMat(COLORS.hor, alt % 30 ? 0.22 : 0.4)));
  for (let az = 0; az < 360; az += 30)
    altazGrid.add(polyline(Array.from({ length: 33 }, (_, i) => altAzDir(az * D2R, (i / 32) * 90 * D2R).multiplyScalar(SKY_R)), lineMat(COLORS.hor, 0.32)));
  const horizonLine = polyline(circle(SKY_R, 256, (t) => V(Math.cos(t) * SKY_R, 0, Math.sin(t) * SKY_R)), lineMat(COLORS.hor, 0.95));
  const meridianLine = polyline(Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI; return V(0, Math.sin(a) * SKY_R, Math.cos(a) * SKY_R); }), lineMat(COLORS.mer, 0.95));
  bgSite.add(altazGrid, horizonLine, meridianLine);
  // Sun and Moon on the sky, at their geocentric directions; the Moon shows its true phase.
  const skySun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)', 'rgba(255,200,120,0)'), depthWrite: false, transparent: true }));
  skySun.scale.setScalar(SKY_R * 0.09);
  const skyMoon = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.012, 32, 16), new THREE.MeshLambertMaterial({ color: 0xdedbd2, transparent: true }));
  const bgSunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  bgScene.add(skySun, skyMoon, bgSunLight, bgSunLight.target, new THREE.AmbientLight(0xffffff, 0.04));

  // ---------- per-frame astronomy ----------
  const sky = {
    gmst: 0, sunDirW: V(), moonDirW: V(), targetDirW: V(), targetLocal: V(0, 0, 1), upW: V(0, 1, 0),
    target: { ra: 0, dec: 0 }, h: null as unknown as Horizontal, sunH: null as unknown as Horizontal,
  };
  function targetRaDec(ms: number, s: Settings) {
    const t = TARGETS[s.target];
    if (t[0] === 'Moon') return eclipticToEquatorial(moonEcliptic(ms));
    if (t[1] === null || t[2] === null) return { ra: s.customRa, dec: s.customDec };
    return { ra: t[1] * D2R, dec: t[2] * D2R };
  }
  function computeSky(s: Settings) {
    sky.gmst = gmst(time);
    const se = sunEcliptic(time), me = moonEcliptic(time);
    sky.sunDirW.copy(vec(sphToVec(se.lon, 0)));
    sky.moonDirW.copy(vec(sphToVec(me.lon, me.lat)));
    sky.target = targetRaDec(time, s);
    sky.h = horizontal(sky.target.ra, sky.target.dec, time, s.lat, s.lon);
    const sunEq = eclipticToEquatorial(se);
    sky.sunH = horizontal(sunEq.ra, sunEq.dec, time, s.lat, s.lon);
    sky.targetDirW.copy(vec(sphToVec(sky.target.ra, sky.target.dec)).applyQuaternion(eqToWorld));
  }

  // Mount axis angles for pointing at the target: (A, B) about the turntable and the arm.
  const axisAngles = (h: Horizontal, dec: number, s: Settings) => (s.mountMode === 'eq' ? { a: -h.ha, b: -dec } : { a: Math.PI - h.az, b: -h.alt });
  function updateMount(dt: number, s: Settings) {
    const goal = axisAngles(sky.h, sky.target.dec, s);
    const tiltGoal = s.mountMode === 'eq' ? -(Math.PI / 2 - s.lat) : 0;
    tilt += clamp(tiltGoal - tilt, -dt * 0.8, dt * 0.8);
    const tiltDone = Math.abs(tiltGoal - tilt) < 1e-4;
    if (s.tracking || slewing) {
      if (slewing || !tiltDone) {
        // Slew at up to 80 degrees per second, faster than a real mount, so lessons don't wait.
        const step = dt * 80 * D2R, da = wrapPi(goal.a - axes.a), db = goal.b - axes.b;
        axes.a += clamp(da, -step, step); axes.b += clamp(db, -step, step);
        if (Math.abs(da) < step && Math.abs(db) < step && tiltDone) slewing = false;
      } else Object.assign(axes, goal);
    }
    mount.wedge.rotation.x = tilt;
    mount.axisA.rotation.y = axes.a;
    mount.axisB.rotation.x = axes.b;
  }
  // Axis speeds in degrees per hour of sky time, from a 2-minute look-ahead.
  function axisRates(s: Settings) {
    const dt = 120000, t2 = targetRaDec(time + dt, s);
    const h2 = horizontal(t2.ra, t2.dec, time + dt, s.lat, s.lon);
    const a1 = axisAngles(sky.h, sky.target.dec, s), a2 = axisAngles(h2, t2.dec, s);
    const k = (3600000 / dt) * R2D;
    return { a: wrapPi(a2.a - a1.a) * k, b: (a2.b - a1.b) * k };
  }

  // ---------- camera ----------
  const anchor = { earth: V(), site: V(), optics: V(), focus: V(), scope: V() };
  const qWorld = new THREE.Quaternion(), qSite = new THREE.Quaternion(), qOpt = new THREE.Quaternion(), qTmp = new THREE.Quaternion();
  const opticsL = () => Math.log10(clamp(((scope.u1 - scope.u0) / 1000) * 1.35, 0.45, 1.5) * METRE);

  function goTo(stop: StopId, opts: { yaw?: number; pitch?: number } = {}) {
    const st = STOPS.find((x) => x.id === stop)!;
    settings.set({ mode: 'orbit' });
    freeGoal = false;
    let yaw = cam.yaw;
    if (opts.yaw === undefined && (stop === 'optics' || stop === 'focus')) yaw = 0;
  else if (opts.yaw !== undefined) yaw = opts.yaw * D2R;
    // On the ground, stand behind the telescope, looking past it toward the target.
    if (opts.yaw === undefined && (stop === 'site' || stop === 'scope') && sky.h) yaw = -sky.h.az + 0.2;
    const L = stop === 'optics' ? opticsL() : st.L;
    // Longer journeys take longer, so no stretch of the zoom rushes past.
    anim = { t: 0, g: 0, h: 0, climb: false, dur: clamp(0.9 + 0.32 * Math.abs(L - cam.L), 1.2, 3.4), fromL: cam.L, to: { L, yaw, pitch: (opts.pitch ?? st.pitch) * D2R } };
  }
  // Your site's orientation in space, worked out from the settings so it works before the first frame.
  function siteQuaternion(st: Settings, out: THREE.Quaternion) {
    const up = vec(sphToVec(st.lon, st.lat));
    const north = V(-Math.sin(st.lat) * Math.cos(st.lon), Math.cos(st.lat), Math.sin(st.lat) * Math.sin(st.lon));
    out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V().crossVectors(north, up), up, north.negate()));
    return out.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), gmst(time))).premultiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -OBLIQUITY));
  }
  // Looks at the slice through your meridian face-on (from the east), close enough to see the angles.
  function faceSiteMeridian() {
    const L = 0.58;
    const qs = siteQuaternion(S(), new THREE.Quaternion());
    const east = V(1, 0, 0).applyQuaternion(qs);
    const local = east.applyQuaternion(qs.slerp(qWorld, fWorldAt(L)).invert());
    goTo('earth');
    freeGoal = true;
    const a = anim!;
    a.to = { L, yaw: Math.atan2(local.x, local.z), pitch: Math.asin(clamp(local.y, -1, 1)) };
    // From the ground: rise straight up first, and only swing round to the side once the whole Earth is in view.
    if (a.fromL < -0.3) { a.climb = true; a.dur += 2; }
  }
  // Yaw 0 faces south, 180 faces north.
  function standHere(yawDeg = 0, pitchDeg = 30) {
    freeGoal = false;
    settings.set({ mode: 'eye' });
    eye.yaw = yawDeg * D2R; eye.pitch = pitchDeg * D2R;
  }

  // Zoom bands, in log10 of camera distance. Each spans most of a decade so nothing snaps.
  const fWorldAt = (L: number) => smooth(L, 0.3, 1.0);             // camera frame: turning with the Earth -> fixed in space
  const fSiteAt = (L: number) => smooth(L, LM - 0.2, LM + 0.4);    // camera frame: the tube -> the site
  // While descending, the camera is held above your site looking down; over the last kilometre it is
  // brought down to a few degrees above level, ready to look past the telescope.
  const landing = (L: number) => smooth(L, LM + 1.8, LM + 3.0);
  const pitchFloor = (L: number) => 82 * D2R * landing(L) * (1 - fWorldAt(L));
  const pitchCeiling = (L: number) => (L > LM + 1.8 && L < LM + 3.0 ? (4 + 81 * landing(L)) * D2R : Infinity);
  const frameQ = (L: number, out: THREE.Quaternion) => out.copy(qOpt).slerp(qSite, fSiteAt(L)).slerp(qWorld, fWorldAt(L));
  const dirOf = (yaw: number, pitch: number) => V(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));

  function weights(s: Settings): Weights {
    const L = cam.L;
    if (s.mode === 'eye') return { L, sol: 0, moon: 0, earth: 0, site: 1, scope: 1, opt: 0 };
    return {
      L,
      sol: smooth(L, 1.9, 2.5),
      moon: smooth(L, 1.15, 1.4) * (1 - smooth(L, 2.5, 3.0)),
      earth: smooth(L, -1.6, -0.6) * (1 - smooth(L, 1.2, 1.45)),
      site: 1 - smooth(L, LM + 2.7, LM + 3.7),
      scope: 1 - smooth(L, LM + 2.0, LM + 2.6),
      opt: 1 - smooth(L, LM - 0.1, LM + 0.5),
    };
  }

  const tmp = V(), fwd = V(), dT = V();
  // Turns the camera up just enough that the horizon sits at least `low` of the half-height below centre,
  // so the ground never takes more than about 15% of the screen.
  function keepGroundLow(k: number, low = 0.7) {
    if (k <= 0) return;
    const fromEarth = tmp.copy(camera.position).sub(anchor.earth);
    const r = fromEarth.length(), up = fromEarth.normalize();
    camera.getWorldDirection(fwd);
    const horizonElev = -Math.acos(Math.min(1, 1 / r));
    const need = horizonElev + Math.atan(low * Math.tan((camera.fov * D2R) / 2));
    const elev = Math.asin(clamp(fwd.dot(up), -1, 1));
    // Pitch about the camera's own right axis: the axis from fwd x up is noise when looking straight down.
    if (elev < need) camera.rotateX((need - elev) * k);
  }

  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  function placeCamera(w: Weights, s: Settings, pull: number, dt: number) {
    const { L } = cam;
    const d = 10 ** L;
    anchor.earth.setFromMatrixPosition(earthSys.matrixWorld);
    site.localToWorld(anchor.site.set(0, mount.anchorHeight, 0));
    model.group.getWorldPosition(anchor.scope);
    model.optics.localToWorld(anchor.optics.set(0, 0, (scope.u0 + scope.u1) / 2));
    model.focus.getWorldPosition(anchor.focus);
    site.getWorldQuaternion(qSite);
    opticsFrame.getWorldQuaternion(qOpt);
    if (s.mode === 'eye') {
      const eyePos = site.localToWorld(mount.eye.clone());
      camera.position.copy(eyePos);
      camera.fov = eye.fov;
      // Looking down below the horizon band isn't allowed: the ground stays in the bottom of the view.
      const minPitch = Math.atan(0.7 * Math.tan((eye.fov * D2R) / 2));
      eye.pitch = Math.max(eye.pitch, minPitch);
      const dir = V(Math.cos(eye.pitch) * Math.sin(eye.yaw), Math.sin(eye.pitch), Math.cos(eye.pitch) * Math.cos(eye.yaw)).applyQuaternion(qSite);
      camera.up.set(0, 1, 0).applyQuaternion(qSite);
      camera.lookAt(eyePos.clone().add(dir));
      camera.near = METRE * 0.05; camera.far = 1e5;
      return;
    }
    // Zooming changes which frame yaw and pitch are measured in. Re-express them so the camera's
    // direction in space carries on smoothly instead of swinging round.
    if (L !== frameL) {
      const dir = dirOf(cam.yaw, cam.pitch).applyQuaternion(frameQ(frameL, qA)).applyQuaternion(frameQ(L, qB).invert());
      cam.pitch = Math.asin(clamp(dir.y, -1, 1));
      if (Math.hypot(dir.x, dir.z) > 1e-6) cam.yaw = Math.atan2(dir.x, dir.z);
      frameL = L;
    }
    if (anim && pull > 0) {
      cam.yaw += wrapPi(anim.to.yaw - cam.yaw) * pull;
      cam.pitch += (anim.to.pitch - cam.pitch) * pull;
    }
    // The descent floor is approached quickly but never snapped to, so leaving a set-piece view doesn't jolt.
    const ease = 1 - Math.exp(-dt * 8);
    fr += ((freeGoal ? smooth(L, -0.6, 0.5) : 0) - fr) * (1 - Math.exp(-dt * 3));
    const floor = pitchFloor(L) * (1 - fr), ceiling = anim?.climb ? Infinity : pitchCeiling(L);
    if (cam.pitch < floor) cam.pitch += (floor - cam.pitch) * ease;
    if (cam.pitch > ceiling) cam.pitch += (ceiling - cam.pitch) * ease;
    // Landing also turns you to stand behind the telescope, facing its target (not while being dragged).
    if (!anim && pts.size === 0 && isFinite(ceiling)) cam.yaw += wrapPi(-sky.h.az + 0.2 - cam.yaw) * ease;
    // Zooming from the telescope into the tube eases round to the side-on cut-away, clear of the tripod.
    if (!anim && pts.size === 0 && L < LM + 0.3 && L > LM - 0.3) {
      cam.yaw += wrapPi(-cam.yaw) * ease;
      cam.pitch += -cam.pitch * ease;
    }
    cam.pitch = clamp(cam.pitch, -1.5, 85 * D2R);
    const fWorld = fWorldAt(L), fSite = fSiteAt(L);
    // A climb lets go of the ground-level framing early, before the lift gets going.
    const climbing = anim?.climb ? smooth(anim.t, 0, 0.25) : 0;
    // What the camera looks at: the focus, the tube, your site, the Earth's centre or the Sun.
    // Between the Earth and your site the target stays far enough below the camera that the camera is
    // always above the ground (it sits at 1 + 0.2 d from the Earth's centre while looking down).
    const tFocus = 1 - smooth(L, LM - 1.6, LM - 0.8), tSun = smooth(L, 1.9, 2.8);
    // After landing (below about 60 m) it is exactly your site.
    const tGround = clamp(1 - 0.8 * d * landing(L), 0, 1);
    const target = anchor.optics.clone().lerp(anchor.focus, tFocus).lerp(anchor.site, fSite);
    target.copy(anchor.earth.clone().lerp(target, tGround)).lerp(V(), tSun);
    frameQ(L, qTmp);
    camera.position.copy(target).addScaledVector(dirOf(cam.yaw, cam.pitch).applyQuaternion(qTmp), d);
    // Last resort: never below the ground.
    const fromEarth = camera.position.clone().sub(anchor.earth);
    const minR = 1 + (w.opt > 0.5 ? -Infinity : 0.12 * METRE);
    if (fromEarth.length() < minR) camera.position.copy(anchor.earth).add(fromEarth.setLength(minR));
    // Near the Earth, keep the horizon level: 'up' is your local vertical, even beside the tube.
    // In the meridian slice, Earth's axis points up the screen so the equator runs left to right.
    camera.up.set(0, 1, 0).applyQuaternion(qTmp).lerp(sky.upW, 1 - fWorld).lerp(tmp.set(0, 1, 0).applyQuaternion(eqToWorld), fr).normalize();
    camera.lookAt(target);
    camera.fov = 50;
    // On the ground, frame the telescope and its target star together.
    const kFrame = fSite * (1 - fWorld) * smooth(L, LM + 0.1, LM + 0.4) * (anim?.climb ? 1 - climbing : 1 - smooth(L, LM + 1.2, LM + 2.0));
    if (kFrame > 0 && sky.h.alt > -0.05) {
      camera.getWorldDirection(fwd);
      dT.copy(anchor.scope).sub(camera.position).normalize();
      const bis = dT.clone().add(sky.targetDirW).normalize();
      const spread = dT.angleTo(sky.targetDirW) * R2D;
      fwd.lerp(bis, kFrame).normalize();
      camera.fov = lerp(50, clamp(spread * 1.25 + 14, 50, 100), kFrame);
      camera.lookAt(tmp.copy(camera.position).add(fwd));
    }
    // Keep a band of sky in view all the way down: high up the horizon may sit near the top of the screen;
    // on the ground it must be in the bottom 15%.
    keepGroundLow(fSite * (1 - fWorld) * (1 - w.opt) * (1 - fr) * (1 - climbing), lerp(0.7, -0.55, smooth(L, LM + 1.8, LM + 2.6)));
    camera.near = d * 2e-3; camera.far = Math.max(d * 1e4, 3000);
  }

  // ---------- labels ----------
  interface Label { el: HTMLDivElement; pos: (v: THREE.Vector3) => THREE.Vector3; alpha: () => number; bg?: boolean; text?: () => string; last?: string }
  const labels: Label[] = [];
  let W8: Weights = weights(S());
  function label(text: string | (() => string), cls: string, pos: Label['pos'], alpha: Label['alpha'], bg = false) {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls;
    const l: Label = { el, pos, alpha, bg };
    if (typeof text === 'function') l.text = text; else el.textContent = text;
    labelLayer.append(el);
    labels.push(l);
    return el;
  }
  function updateLabels(w: number, h: number, s: Settings) {
    for (const l of labels) {
      const a = s.layers.labels ? l.alpha() : 0;
      if (a < 0.03) { l.el.style.opacity = '0'; continue; }
      if (l.text) { const t = l.text(); if (t !== l.last) l.el.textContent = l.last = t; }
      l.pos(tmp);
      if (l.bg) tmp.multiplyScalar(SKY_R).project(bgCamera); else tmp.project(camera);
      if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) { l.el.style.opacity = '0'; continue; }
      l.el.style.opacity = String(a);
      l.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    }
  }
  const above = (dirW: THREE.Vector3) => (!S().layers.ground ? dirW.dot(sky.upW) > -0.02 : true);
  const lay = (k: keyof Settings['layers']) => S().layers[k];
  const solarLbl = (text: string, pos: Label['pos']) => label(text, 'l-solar', pos, () => W8.sol);
  solarLbl('Sun', (v) => v.set(0, SUN_R * 1.3, 0));
  solarLbl('Earth', (v) => v.copy(earthSys.position).add(V(0, 14, 0)));
  solarLbl('Ecliptic plane (Earth’s orbit)', (v) => v.set(ORBIT_R * 0.72, 0, ORBIT_R * 0.72));
  for (const m of seasonMarks) label(m.name, 'l-solar dim', (v) => v.copy(m.p).add(V(0, 6, 0)), () => W8.sol);
  label('Moon', 'l-moon', (v) => moon.getWorldPosition(v), () => Math.max(W8.moon, W8.earth * 0.8));
  label('North celestial pole', 'l-eq', (v) => tilt3.localToWorld(v.set(0, SHELL_R * 1.05, 0)), () => (lay('eq') ? W8.earth : 0));
  label('Celestial equator', 'l-eq', (v) => tilt3.localToWorld(v.set(SHELL_R * 0.72, 0, SHELL_R * 0.72)), () => (lay('eq') ? W8.earth : 0));
  label('Ecliptic', 'l-ecl', (v) => earthSys.localToWorld(v.copy(sky.sunDirW).applyAxisAngle(V(0, 1, 0), 1.2).multiplyScalar(SHELL_R)), () => (lay('ecl') ? W8.earth : 0));
  label('Sun’s direction', 'l-sun', (v) => shellSun.getWorldPosition(v), () => W8.earth * 0.8);
  label('Earth’s axis', 'l-axis', (v) => tilt3.localToWorld(v.set(0, 1.9 * axisLine.scale.y, 0)), () => Math.max(W8.earth, W8.sol));
  label('You', 'l-brass', (v) => sitePin.getWorldPosition(v), () => Math.max(W8.earth, W8.moon) * 0.95);
  label('Your horizon', 'l-hor', (v) => siteBig.localToWorld(v.set(1.1, 0, 1.1)), () => (lay('hor') ? W8.earth : 0));
  label('Meridian', 'l-mer', (v) => meridianShell.localToWorld(v.set(0, SHELL_R * 0.7, 0)), () => (lay('mer') ? W8.earth : 0));
  label('Target', 'l-brass', (v) => shellTarget.getWorldPosition(v), () => W8.earth);
  const latLbl = (text: string | (() => string), cls: string, pos: (v: THREE.Vector3) => THREE.Vector3) => label(text, cls, (v) => spin.localToWorld(pos(v)), () => (lay('lat') ? W8.earth : 0));
  const latText = () => `latitude ${(Math.abs(S().lat) * R2D).toFixed(1)}°`;
  latLbl(latText, 'l-angle', (v) => v.copy(latPts.centre));
  latLbl(latText, 'l-angle', (v) => v.copy(latPts.site));
  latLbl('Equator', 'l-solar', (v) => v.copy(vec(sphToVec(S().lon, 0))).multiplyScalar(1.6));
  latLbl('Zenith (straight up)', 'l-hor', (v) => v.copy(vec(sphToVec(S().lon, S().lat))).multiplyScalar(1.6));
  latLbl('Mount’s polar axis, parallel to Earth’s axis', 'l-eq', (v) => v.copy(vec(sphToVec(S().lon, S().lat))).add(V(0, 1.2, 0)));
  latLbl('Horizon, looking north', 'l-hor', (v) => { const s = S(); return v.copy(vec(sphToVec(s.lon, s.lat))).add(V(-Math.sin(s.lat) * Math.cos(s.lon), Math.cos(s.lat), Math.sin(s.lat) * Math.sin(s.lon)).multiplyScalar(1.2)); });
  label(() => `polar axis tilt = latitude = ${(Math.abs(S().lat) * R2D).toFixed(1)}°`, 'l-angle', (v) => site.localToWorld(v.set(0, mount.wedge.position.y + 0.12, -0.36)), () => (lay('lat') && S().mountMode === 'eq' ? W8.scope * (1 - W8.opt) : 0));
  const skyLbl = (text: string, cls: string, dir: () => THREE.Vector3, extra = () => 1) =>
    label(text, cls, (v) => v.copy(dir()), () => (W8.site > 0.5 && above(dir()) ? extra() : 0), true);
  const siteDir = (x: number, y: number, z: number) => () => V(x, y, z).normalize().applyQuaternion(bgSite.quaternion);
  for (const [n, x, z] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]] as const) skyLbl(n, 'l-hor big', siteDir(x, 0.02, z), () => (lay('hor') ? 1 : 0));
  skyLbl('Zenith', 'l-hor', siteDir(0, 1, 0), () => (lay('hor') ? 1 : 0));
  skyLbl('Meridian', 'l-mer', siteDir(0, Math.sin(1.1), Math.cos(1.1)), () => (lay('mer') ? 1 : 0));
  skyLbl('North celestial pole', 'l-eq', () => V(0, 1, 0).applyQuaternion(eqToWorld), () => (lay('eq') ? 1 : 0));
  skyLbl('Celestial equator', 'l-eq', () => { const d = V(0, 0, 1).applyQuaternion(bgSite.quaternion), e = V(0, 1, 0).applyQuaternion(eqToWorld); return d.sub(e.multiplyScalar(d.dot(e))).normalize(); }, () => (lay('eq') ? 1 : 0));
  skyLbl('Ecliptic', 'l-ecl', () => sky.sunDirW.clone().applyAxisAngle(V(0, 1, 0), Math.PI / 2), () => (lay('ecl') ? 1 : 0));
  skyLbl('Sun', 'l-sun', () => sky.sunDirW);
  skyLbl('Moon', 'l-moon', () => sky.moonDirW);
  skyLbl('', 'l-brass ring', () => sky.targetDirW);
  for (const [ra, dec, mag, name] of DATA.named) {
    if (mag > 1.6) continue;
    const d = vec(sphToVec(ra * D2R, dec * D2R)).applyQuaternion(eqToWorld);
    skyLbl(name, 'l-star', () => d, () => (lay('names') ? 0.8 : 0));
  }
  for (const [ra, dec, name] of DATA.cnames) {
    const d = vec(sphToVec(ra * D2R, dec * D2R)).applyQuaternion(eqToWorld);
    skyLbl(name, 'l-con', () => d, () => (lay('con') && lay('names') ? 0.55 : 0));
  }
  label(() => TARGETS[S().target][0], 'l-brass tname', (v) => v.copy(sky.targetDirW), () => (W8.site > 0.5 && above(sky.targetDirW) ? 1 : 0), true);
  // Optics labels, in the optics group's millimetre coordinates.
  const NOWHERE: [number, number, number] = [0, 0, -1e6];
  const opticsLbl = (text: string | (() => string), cls: string, pos: () => [number, number, number]) =>
    label(text, cls, (v) => { const [x, , z] = pos(); return model.optics.localToWorld(v.set(0, x, z)); }, () => (S().mode === 'eye' ? 0 : smooth(W8.opt, 0.6, 1)));
  const fNum = () => (scope.focalLength / scope.aperture).toFixed(1);
  const nominalF = () => scopeInfo.get().nominalFocal;
  opticsLbl('Starlight', 'l-optics', () => [scope.aperture * 0.4, 0, scope.uAperture + 330]);
  opticsLbl('Focus', 'l-optics', () => [scope.focus[1], 0, scope.focus[0]]);
  opticsLbl(() => (scope.type === 'petzval' ? 'Front lens group' : 'Objective lens'), 'l-optics', () => (scope.lens ? [scope.aperture * 0.62, 0, scope.lens.top] : NOWHERE));
  opticsLbl('Rear lens group', 'l-optics', () => (scope.type === 'petzval' ? [scope.aperture * 0.5, 0, scope.lens!.surfaces[3].u0] : NOWHERE));
  opticsLbl('Primary mirror', 'l-optics', () => (scope.mirrors ? [scope.mirrors[0].rMax * 0.8, 0, 8] : NOWHERE));
  opticsLbl('Secondary mirror', 'l-optics', () => (scope.type === 'sct' ? [-34, 0, 325] : scope.diagonal ? [-40, 0, 590] : NOWHERE));
  opticsLbl('Corrector plate', 'l-optics', () => (scope.corrector ? [-80, 0, 334] : NOWHERE));
  opticsLbl('Eyepiece', 'l-optics', () => (scope.eyepiece ? [scope.eyepiece.c[1] + (scope.exitAxis[1] ? 10 : 22), 0, scope.eyepiece.c[0] + (scope.exitAxis[1] ? 40 : 0)] : NOWHERE));
  opticsLbl(() => (scope.sensor ? `Image sensor ${scope.sensor[0].toFixed(1)} × ${scope.sensor[1].toFixed(1)} mm` : ''), 'l-optics', () => (scope.sensor ? [scope.sensor[0] / 2 + 10, 0, scope.focus[0] - 6] : NOWHERE));
  opticsLbl('Light path drawn unfolded: the real S50 Pro folds it to fit its 170 mm body', 'l-optics dim', () => (scope.seestarBody ? [-scope.aperture - 20, 0, scope.focus[0] + 40] : NOWHERE));
  opticsLbl(() => `Aperture ${scope.aperture} mm`, 'l-dim', () => [scope.aperture / 2 + 8, 0, scope.uAperture + 14]);
  opticsLbl(() => `Focal length ${nominalF()} mm`, 'l-dim', () => (scope.lens ? [-(scope.rTube + 12), 0, scope.focus[0] + scope.focalLength * 0.5] : NOWHERE));
  opticsLbl(() => `f/${fNum()} = ${nominalF()} ÷ ${scope.aperture}`, 'l-dim', () => (scope.exitAxis[1] ? [scope.focus[1], 0, scope.focus[0] - 90] : [scope.rTube * 0.7, 0, scope.focus[0] + Math.min(60, scope.focalLength * 0.15)]));
  opticsLbl(() => (scope.field ? `Field of view ${scope.field[0].toFixed(2)}° × ${scope.field[1].toFixed(2)}°` : ''), 'l-dim', () => (scope.field ? [Math.max(scope.aperture / 2, 20) + 30, 0, scope.uAperture + 120] : NOWHERE));

  // ---------- camera (eyepiece / sensor) view ----------
  const ev = eyeCanvas.getContext('2d')!;
  const qInv = new THREE.Quaternion();
  function drawEyeView(daylight: number) {
    const Wd = eyeCanvas.width, Hd = eyeCanvas.height, cx = Wd / 2, cy = Hd / 2;
    ev.clearRect(0, 0, Wd, Hd);
    model.group.getWorldQuaternion(qInv).invert();
    // A camera sensor is a portrait rectangle; an eyepiece shows a circle.
    const fov = scope.field ?? [scope.trueField!, scope.trueField!];
    const half = (Math.max(fov[0], fov[1]) / 2) * D2R, R = Math.min(Wd, Hd) * 0.46, k = R / Math.tan(half);
    const tw = scope.sensor ? Math.tan((fov[0] / 2) * D2R) * k : R, th = scope.sensor ? Math.tan((fov[1] / 2) * D2R) * k : R;
    const outline = () => { ev.beginPath(); if (scope.sensor) ev.rect(cx - tw, cy - th, tw * 2, th * 2); else ev.arc(cx, cy, R, 0, Math.PI * 2); };
    ev.save();
    outline();
    ev.fillStyle = `rgb(${lerp(3, 24, daylight)},${lerp(5, 36, daylight)},${lerp(12, 58, daylight)})`;
    ev.fill(); ev.clip();
    const p = V();
    // Inverted image, as through a real telescope: screen x follows +x, screen y follows +y.
    const plot = (dirW: THREE.Vector3, draw: (x: number, y: number) => void) => {
      p.copy(dirW).applyQuaternion(qInv);
      if (p.z > Math.cos(half * 1.5)) draw(cx + (p.x / p.z) * k, cy + (p.y / p.z) * k);
    };
    for (const [dir, mag, bv] of starDirs) plot(dir, (x, y) => {
      const c = bvColor(bv);
      ev.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
      ev.beginPath(); ev.arc(x, y, clamp(5.5 - mag * 0.75, 0.8, 6), 0, Math.PI * 2); ev.fill();
    });
    plot(sky.targetDirW, (x, y) => { ev.strokeStyle = 'rgba(224,184,102,0.9)'; ev.lineWidth = 1.5; ev.beginPath(); ev.arc(x, y, 9, 0, Math.PI * 2); ev.stroke(); });
    const discR = 0.26 * D2R * k;
    plot(sky.moonDirW, (x, y) => { ev.fillStyle = '#d9d6cc'; ev.beginPath(); ev.arc(x, y, discR, 0, Math.PI * 2); ev.fill(); });
    let sunInView = false;
    plot(sky.sunDirW, (x, y) => { sunInView = true; ev.fillStyle = '#fff6d0'; ev.beginPath(); ev.arc(x, y, discR, 0, Math.PI * 2); ev.fill(); });
    ev.restore();
    ev.strokeStyle = '#59627a'; ev.lineWidth = 2;
    outline(); ev.stroke();
    return sunInView;
  }

  // ---------- main loop ----------
  let lastFrame = performance.now(), lastLive = 0, raf = 0;
  // prev moves on before the handler runs: the handler can set settings again (goTo does), and must not see
  // the same change twice.
  const unsub = settings.subscribe(() => { const s = S(), p = prev; prev = s; if (s !== p) onSettings(s, p); });
  let prev = S();
  function onSettings(s: Settings, p: Settings) {
    if (s.telescope !== p.telescope || s.corrected !== p.corrected || s.custom !== p.custom) {
      const wasOptics = W8.opt > 0.5 && s.mode === 'orbit';
      buildScope();
      if (wasOptics && cam.L > LM - 1) goTo('optics'); // reframe the resized tube
    }
    if (s.lat !== p.lat || s.lon !== p.lon) { buildLatDiagram(s.lat, s.lon); buildWedgeArc(s.lat, mount.wedge.position.y); }
    if (s.target !== p.target || s.mountMode !== p.mountMode || s.lat !== p.lat || s.lon !== p.lon || s.customRa !== p.customRa || s.customDec !== p.customDec || (s.tracking && !p.tracking)) slewing = true;
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const s = S();
    // rAF timestamps can trail performance.now(), so the first step can come out negative.
    const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;
    time += dt * 1000 * s.speed;
    let pull = 0;
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / anim.dur);
      const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
      const e = ease(anim.climb ? anim.t / 0.6 : anim.t);
      // Fraction of the remaining yaw/pitch turn to make this frame, so both arrive exactly at the end.
      const g = anim.climb ? ease((anim.t - 0.45) / 0.55) : e;
      pull = anim.g < 1 ? (g - anim.g) / (1 - anim.g) : 1;
      anim.g = g;
      // A climb first tilts down gently to look straight down on your site, ahead of the descent rule's quicker tilt.
      if (anim.climb && anim.h < 1) {
        const h = ease(anim.t / 0.42);
        cam.pitch += (85 * D2R - cam.pitch) * ((h - anim.h) / (1 - anim.h));
        anim.h = h;
      }
      cam.L = lerp(anim.fromL, anim.to.L, e);
    }
    computeSky(s);
    const w = (W8 = weights(s));

    // Bodies
    const earthPos = sky.sunDirW.clone().multiplyScalar(-ORBIT_R);
    earthSys.position.copy(earthPos);
    earthSys.scale.setScalar(s.mode === 'eye' ? 1 : 1 + 9 * smooth(w.L, 1.8, 2.7));
    spin.rotation.y = sky.gmst;
    moon.position.copy(sky.moonDirW).multiplyScalar(MOON_ORBIT_R);
    moon.lookAt(earthPos);
    updateMoonOrbit();
    shellSun.position.copy(sky.sunDirW).multiplyScalar(SHELL_R);
    shellTarget.position.copy(vec(sphToVec(sky.target.ra, sky.target.dec)).multiplyScalar(SHELL_R));
    shellTarget.lookAt(V(0, 0, 0));

    // Site frame: x east, y up, z south.
    const up = vec(sphToVec(s.lon, s.lat));
    const north = V(-Math.sin(s.lat) * Math.cos(s.lon), Math.cos(s.lat), Math.sin(s.lat) * Math.sin(s.lon));
    const basis = new THREE.Matrix4().makeBasis(V().crossVectors(north, up), up, north.clone().negate());
    for (const g of [site, siteBig]) { g.position.copy(up); g.quaternion.setFromRotationMatrix(basis); }
    meridianShell.quaternion.setFromUnitVectors(V(1, 0, 0), V(up.x, 0, up.z).normalize());

    updateMount(dt, s);
    scene.updateMatrixWorld(true);
    sky.upW.set(0, 1, 0).applyQuaternion(site.getWorldQuaternion(qTmp));
    placeCamera(w, s, pull, dt);
    if (anim && anim.t >= 1) anim = null;
    for (const c of [camera, bgCamera]) c.setViewOffset(canvas.clientWidth, canvas.clientHeight, -shift.dx, shift.dy, canvas.clientWidth, canvas.clientHeight);
    bgCamera.quaternion.copy(camera.quaternion);
    bgCamera.fov = camera.fov;
    camera.updateProjectionMatrix();
    bgCamera.updateProjectionMatrix();

    // Background sky
    site.getWorldQuaternion(bgSite.quaternion);
    bgSunLight.position.copy(sky.sunDirW).multiplyScalar(SKY_R * 2);
    skySun.position.copy(sky.sunDirW).multiplyScalar(SKY_R * 0.97);
    skyMoon.position.copy(sky.moonDirW).multiplyScalar(SKY_R * 0.96);
    const sunAltDeg = Math.asin(clamp(sky.sunDirW.dot(sky.upW), -1, 1)) * R2D;
    const daylight = w.site * smooth(sunAltDeg, -12, 4);
    const Ly = s.layers;
    setAlpha(bgEqGrid, Ly.eq ? w.site : 0);
    setAlpha(bgEclLine, Ly.ecl ? Math.max(w.site, 0.35 * w.sol) : 0);
    setAlpha(altazGrid, Ly.hor ? w.site : 0);
    setAlpha(horizonLine, Ly.hor ? w.site : 0);
    setAlpha(meridianLine, Ly.mer ? w.site : 0);
    setAlpha(conLines, Ly.con ? lerp(0.6, 1, w.site) * (1 - 0.3 * daylight) : 0);
    const starMat = bgStars.material as THREE.ShaderMaterial;
    starMat.uniforms.alpha.value = 1 - 0.3 * daylight;
    starMat.uniforms.scale.value = renderer.getPixelRatio() * (s.mode === 'eye' ? clamp(70 / eye.fov, 1, 3) : 1);
    setAlpha(skySun, w.site);
    setAlpha(skyMoon, w.site);
    // Daytime is only hinted at: a bright blue sky hides the stars, lines and telescope this is all about.
    renderer.setClearColor(new THREE.Color(0x02030a).lerp(new THREE.Color(0x1e2d47), daylight));

    // Scene layer fades
    setAlpha(solarGroup, w.sol);
    setAlpha(eclPlane, Ly.ecl ? w.sol : 0);
    setAlpha(shellEq, Ly.eq ? w.earth : 0);
    setAlpha(shellPoles, Ly.eq ? w.earth : 0);
    setAlpha(shellEcl, Ly.ecl ? w.earth : 0);
    setAlpha(shellSun, Ly.lat ? 0 : w.earth);
    setAlpha(shellTarget, w.earth);
    const shellMat = shellStars.material as THREE.ShaderMaterial;
    shellMat.uniforms.alpha.value = w.earth;
    shellMat.uniforms.scale.value = renderer.getPixelRatio();
    shellStars.visible = w.earth > 0.01;
    setAlpha(siteBig, Ly.hor && !Ly.lat ? w.earth * smooth(w.L, 0.5, 0.9) : 0); // gone before you reach the surface
    setAlpha(sitePin, Math.max(w.earth, w.moon));
    if (moonOrbit) setAlpha(moonOrbit, Ly.moonOrbit ? Math.max(w.moon, w.sol * 0.8) : 0);
    setAlpha(axisLine, Math.max(w.earth, w.sol, w.moon) * 0.9);
    axisLine.scale.y = 1 + 2.5 * w.sol; // long enough to see its fixed direction around the orbit
    setAlpha(meridianShell, Ly.mer ? w.earth : 0);
    setAlpha(latDiagram, Ly.lat ? w.earth : 0);
    setAlpha(wedgeArc, Ly.lat && s.mountMode === 'eq' && Math.abs(tilt) > 0.01 ? w.scope * (1 - w.opt) : 0);
    // Ground and Earth: hidden inside the tube, faint when "see through the ground" is on.
    const seeThrough = Ly.ground && w.site > 0.5;
    const groundAlpha = (seeThrough ? 0.25 : 1) * (1 - smooth(w.opt, 0, 0.4)) * smooth(w.site, 0, 0.8); // fades into the map from above
    groundMat.uniforms.opacity.value = groundAlpha;
    groundMat.uniforms.light.value = 1 + 1.6 * daylight;
    groundMat.depthWrite = groundAlpha > 0.9;
    ground.visible = w.site > 0.01 && groundAlpha > 0.01;
    earthMat.opacity = (seeThrough ? 0.2 : Ly.lat ? lerp(1, 0.3, w.earth) : 1) * (1 - w.opt);
    earthMat.depthWrite = earthMat.opacity > 0.9;
    earth.visible = earthMat.opacity > 0.01;
    site.visible = w.site > 0.01;
    const bodyAlpha = 1 - 0.75 * w.opt;
    for (const m of [...mount.materials, ...model.bodyMaterials]) m.opacity = (m.userData.base ??= m.opacity) * bodyAlpha;
    model.inner.visible = w.opt > 0.01 && s.mode !== 'eye';
    setAlpha(model.ann, w.opt);
    (pointer.material as THREE.LineBasicMaterial).opacity = 0.55 * w.scope * (1 - w.opt);
    (polarRod.material as THREE.LineBasicMaterial).opacity = s.mountMode === 'eq' ? 0.9 * w.scope * (1 - w.opt) : 0;
    // Near the ground the sky shows the Sun and Moon at their true directions; hide the scale models.
    sun.visible = sunGlow.visible = moon.visible = w.site < 0.5;

    // Starlight inside the telescope, at its real angle to the tube in the drawn slice (the tube's y-z plane).
    model.group.getWorldQuaternion(qInv).invert();
    sky.targetLocal.copy(sky.targetDirW).applyQuaternion(qInv);
    model.updateRays(Math.atan2(sky.targetLocal.y, sky.targetLocal.z), model.inner.visible ? w.opt * (sky.h.alt > 0 || Ly.ground ? 1 : 0.15) : 0);

    renderer.clear();
    renderer.render(bgScene, bgCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
    updateLabels(canvas.clientWidth, canvas.clientHeight, s);
    const sunInView = drawEyeView(daylight);

    if (now - lastLive > 125) {
      lastLive = now;
      const r = axisRates(s);
      const stop = s.mode === 'eye' ? 'eye' : STOPS.reduce((b, st) => (Math.abs((st.id === 'optics' ? opticsL() : st.L) - w.L) < Math.abs((b.id === 'optics' ? opticsL() : b.L) - w.L) ? st : b)).id;
      live.set({
        clock: new Date(time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        lst: sky.h.lst, sunAlt: sky.sunH.alt, ra: sky.target.ra, dec: sky.target.dec, ha: sky.h.ha, alt: sky.h.alt, az: sky.h.az,
        rateA: r.a, rateB: r.b, offAxisDeg: Math.acos(clamp(sky.targetLocal.z, -1, 1)) * R2D, stop, sunInView,
      });
    }
  }

  // ---------- input: drag to orbit (or look around), wheel or pinch to zoom ----------
  let pinch = 0;
  const zoomBy = (dL: number) => {
    if (S().mode === 'eye') eye.fov = clamp(eye.fov * 10 ** dL, 4, 110);
    else { cam.L = clamp(cam.L + dL, LM - 2.4, 3.3); freeGoal = false; }
  };
  const onDown = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); anim = null; };
  const onUp = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
  const onMove = (e: PointerEvent) => {
    const p0 = pts.get(e.pointerId);
    if (!p0) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomBy((pinch - dist) * 0.006);
      pinch = dist;
      return;
    }
    const dx = e.clientX - p0[0], dy = e.clientY - p0[1];
    if (S().mode === 'eye') {
      const k = (eye.fov / canvas.clientHeight) * D2R;
      eye.yaw += dx * k; eye.pitch = clamp(eye.pitch + dy * k, -0.3, 1.55);
    } else {
      cam.yaw -= dx * 0.006; cam.pitch = clamp(cam.pitch + dy * 0.006, -1.5, 1.5);
    }
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); anim = null; zoomBy(e.deltaY * (e.deltaMode ? 0.05 : 0.0016)); };
  const onKey = (e: KeyboardEvent) => {
    const k = ({ ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] } as Record<string, [number, number]>)[e.key];
    if (k) { cam.yaw += k[0]; cam.pitch = clamp(cam.pitch + k[1], -1.5, 1.5); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') zoomBy(-0.15);
    if (e.key === '-') zoomBy(0.15);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = bgCamera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  buildScope();
  buildLatDiagram(S().lat, S().lon);
  computeSky(S());
  raf = requestAnimationFrame(frame);

  return {
    goTo, standHere, faceSiteMeridian,
    setTime: (ms) => { time = ms; },
    getTime: () => time,
    setViewShift: (dx, dy) => { shift = { dx, dy }; },
    dispose: () => {
      cancelAnimationFrame(raf); unsub(); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('keydown', onKey);
      labelLayer.replaceChildren();
      renderer.dispose();
    },
  };
}

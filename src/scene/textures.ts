import * as THREE from 'three';
import { DATA } from '../data.ts';
import { canvas2d } from './helpers.ts';

export function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,180,80,0)') {
  const [c, x] = canvas2d(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(',1)', ',0.6)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Equirectangular Earth texture drawn from the coastline data, with a 15 degree graticule.
export function earthTexture() {
  const W = 4096, H = 2048, [c, x] = canvas2d(W, H);
  x.fillStyle = '#163a6b'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#4c6b3c'; x.strokeStyle = '#9fb58a'; x.lineWidth = 2;
  for (const ring of DATA.land) {
    x.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const px = ((ring[i] + 180) / 360) * W, py = ((90 - ring[i + 1]) / 180) * H;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath(); x.fill(); x.stroke();
  }
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 2;
  for (let lon = -180; lon <= 180; lon += 15) { x.beginPath(); x.moveTo(((lon + 180) / 360) * W, 0); x.lineTo(((lon + 180) / 360) * W, H); x.stroke(); }
  for (let lat = -75; lat <= 75; lat += 15) { x.beginPath(); x.moveTo(0, ((90 - lat) / 180) * H); x.lineTo(W, ((90 - lat) / 180) * H); x.stroke(); }
  x.strokeStyle = 'rgba(255,214,120,0.7)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Moon texture with rough near-side maria, so tidal locking is visible.
export function moonTexture() {
  const W = 1024, H = 512, [c, x] = canvas2d(W, H);
  x.fillStyle = '#a9a9a4'; x.fillRect(0, 0, W, H);
  const maria = [[-15, 35, 16, 11], [17, 28, 9, 8], [31, 8, 10, 8], [59, 17, 6, 5], [-45, 15, 22, 25], [-17, -20, 11, 8], [51, -4, 8, 9], [35, -14, 7, 7], [-37, -24, 7, 5]];
  x.fillStyle = '#5f605e';
  for (const [lon, lat, rx, ry] of maria) {
    x.beginPath(); x.ellipse(((lon + 180) / 360) * W, ((90 - lat) / 180) * H, (rx / 360) * W, (ry / 180) * H, 0, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The ground around the site: a cap of the Earth's real curvature (so the horizon dips correctly),
// textured with fine speckle near the telescope that fades into horizon haze.
export function groundCap(earthRadiusM: number, radiusM = 6000) {
  const rings = [0, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 20, 30, 45, 70, 100, 150, 220, 330, 500, 750, 1100, 1700, 2600, 4000, radiusM];
  const seg = 160, pos: number[] = [], idx: number[] = [];
  for (const r of rings) for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    pos.push(r * Math.cos(a), Math.sqrt(earthRadiusM * earthRadiusM - r * r) - earthRadiusM, r * Math.sin(a));
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { light: { value: 1 }, opacity: { value: 1 }, haze: { value: new THREE.Color(0x26304a) }, grass: { value: new THREE.Color(0x3d5233) } },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vPos;
      void main() {
        vPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      uniform float light; uniform float opacity; uniform vec3 haze; uniform vec3 grass;
      varying vec2 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vPos);
        // Speckle at two scales, faded out with distance before it can alias.
        float n = 0.6 * hash(floor(vPos * 6.0)) + 0.4 * hash(floor(vPos * 0.9));
        vec3 col = grass * mix(0.75, 1.3, n * (1.0 - smoothstep(6.0, 60.0, r)) + 0.5 * smoothstep(6.0, 60.0, r));
        // A faint ring every 5 m near the telescope gives a sense of scale.
        float ring = 1.0 - smoothstep(0.0, 0.06, abs(fract(r / 5.0 + 0.5) - 0.5) * 5.0);
        col += vec3(0.05, 0.07, 0.04) * ring * (1.0 - smoothstep(10.0, 30.0, r));
        col = mix(col, haze, smoothstep(40.0, 3000.0, r));
        gl_FragColor = vec4(col * light, opacity);
      }`,
  });
  return new THREE.Mesh(g, mat);
}

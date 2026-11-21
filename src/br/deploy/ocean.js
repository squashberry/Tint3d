// Animated stylised ocean with hull foam, bow wave and stern wake.

import * as THREE from 'three';
import { ATMOS, NOISE_GLSL } from './sky.js';
import { FX } from './effects.js';
import { CARRIER_ORIGIN, DECK } from './constants.js';

const WAVES_GLSL = /* glsl */ `
vec3 wave(vec2 p, vec2 d, float k, float a, float w, float t) {
  float ph = dot(p, d) * k + t * w;
  float s = sin(ph);
  float c = cos(ph);
  return vec3(a * s, a * k * c * d.x, a * k * c * d.y);
}
vec3 waves(vec2 p, float t) {
  vec3 r = vec3(0.0);
  r += wave(p, normalize(vec2(1.0, 0.35)), 0.052, 1.1, 1.05, t);
  r += wave(p, normalize(vec2(0.6, 1.0)), 0.083, 0.55, 1.3, t);
  r += wave(p, normalize(vec2(-0.4, 1.0)), 0.14, 0.28, 1.7, t);
  r += wave(p, normalize(vec2(1.0, -0.7)), 0.23, 0.14, 2.2, t);
  return r;
}`;

const OC_VERT = /* glsl */ `
uniform float uTime;
uniform float uWaveAmp;
uniform vec2 uFineCenter;
uniform float uFineR;
varying vec3 vWorld;
${WAVES_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float fade = 1.0 - smoothstep(0.7, 1.0, length(wp.xz - uFineCenter) / uFineR);
  vec3 w = waves(wp.xz, uTime);
  wp.y += w.x * uWaveAmp * fade;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const OC_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform vec2 uShip;
uniform vec2 uShipHalf;
uniform vec2 uIsland;
uniform float uWaveAmp;
varying vec3 vWorld;
${NOISE_GLSL}
${WAVES_GLSL}
vec3 skyCol(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.5));
  float sd = max(dot(d, uSun), 0.0);
  c += uSunColor * (pow(sd, 6.0) * 0.3 + pow(sd, 64.0) * 0.7);
  return mix(c, uHorizon, exp(-h * 9.0) * 0.5);
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 w = waves(vWorld.xz, uTime);
  float amp = max(uWaveAmp, 0.35);
  vec2 rip = vec2(vnoise(vWorld.xz * 0.35 + uTime * 0.3), vnoise(vWorld.xz * 0.35 - uTime * 0.27 + 9.0)) - 0.5;
  vec3 n = normalize(vec3(-w.y * amp * 1.6 - rip.x * 0.35, 1.0, -w.z * amp * 1.6 - rip.y * 0.35));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 refl = skyCol(reflect(-V, n));
  float diff = max(dot(n, uSun), 0.0);
  float depthMix = 0.35 + 0.35 * vnoise(vWorld.xz * 0.004);
  vec3 base = mix(uDeep, uShallow, depthMix * 0.6 + diff * 0.15);
  vec3 col = mix(base * (0.55 + 0.6 * diff), refl, fres);
  vec3 H = normalize(uSun + V);
  col += uSunColor * pow(max(dot(n, H), 0.0), 420.0) * 3.0;

  vec2 q = vWorld.xz - uShip;
  float sd = sdRoundBox(q, uShipHalf, 40.0);
  float streak = fbm(vec2(q.x * 0.05 + uTime * 1.3, q.y * 0.3));
  float hullFoam = (1.0 - smoothstep(0.0, 26.0, sd)) * smoothstep(0.35, 0.7, streak + 0.35);
  float behind = -(q.x + uShipHalf.x);
  float wakeW = 70.0 + max(behind, 0.0) * 0.06;
  float wake = step(0.0, behind) * (1.0 - smoothstep(0.0, 520.0, behind)) * (1.0 - smoothstep(wakeW * 0.5, wakeW, abs(q.y)));
  float wakeN = fbm(vec2(q.x * 0.035 + uTime * 1.6, q.y * 0.09));
  float wakeFoam = wake * smoothstep(0.38, 0.72, wakeN + wake * 0.3);
  float bow = (q.x - uShipHalf.x) / 90.0;
  float bowFoam = step(0.0, bow) * (1.0 - smoothstep(0.0, 1.0, bow)) * (1.0 - smoothstep(0.0, 70.0, abs(q.y) - 20.0 * (1.0 - bow)));
  float caps = smoothstep(1.15, 1.75, w.x + 0.5) * smoothstep(0.45, 0.75, vnoise(vWorld.xz * 0.9 + uTime * 0.4));
  float foam = clamp(max(max(hullFoam, wakeFoam), bowFoam * 0.8) + caps * 0.35, 0.0, 1.0);
  col = mix(col, vec3(0.93, 0.97, 1.0), foam * 0.9);

  float dist = length(vWorld - cameraPosition);
  col = mix(col, uFogColor, smoothstep(uFogRange.x, uFogRange.y, dist));
  float isl = smoothstep(2300.0, 1500.0, length(vWorld.xz - uIsland));
  float alpha = mix(0.93, 0.62, isl);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function frameGeometry(outer, inner) {
  const o = outer / 2;
  const i = inner / 2;
  const p = [-o, -o, o, -o, o, o, -o, o, -i, -i, i, -i, i, i, -i, i];
  const pos = [];
  for (let k = 0; k < 8; k++) pos.push(p[k * 2], 0, p[k * 2 + 1]);
  const idx = [];
  for (let k = 0; k < 4; k++) {
    const a = k;
    const b = (k + 1) % 4;
    idx.push(a, 4 + a, 4 + b, a, 4 + b, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function createOcean({ segments = 110, fine = true, fogNear = 1800, fogFar = 11000 } = {}) {
  const group = new THREE.Group();
  group.name = 'ocean';
  const fineSize = 2600;
  const makeMat = (amp) =>
    new THREE.ShaderMaterial({
      vertexShader: OC_VERT,
      fragmentShader: OC_FRAG,
      uniforms: {
        uTime: FX.uTime,
        uWaveAmp: { value: amp },
        uFineCenter: { value: new THREE.Vector2(CARRIER_ORIGIN.x, CARRIER_ORIGIN.z) },
        uFineR: { value: fineSize / 2 },
        uSun: { value: ATMOS.sun },
        uSunColor: { value: ATMOS.sunColor },
        uDeep: { value: ATMOS.deepWater },
        uShallow: { value: ATMOS.shallowWater },
        uHorizon: { value: ATMOS.horizon },
        uZenith: { value: ATMOS.zenith },
        uFogColor: { value: ATMOS.fog },
        uFogRange: { value: new THREE.Vector2(fogNear, fogFar) },
        uShip: { value: new THREE.Vector2(CARRIER_ORIGIN.x, CARRIER_ORIGIN.z) },
        uShipHalf: { value: new THREE.Vector2(DECK.halfLength - 10, 58) },
        uIsland: { value: new THREE.Vector2(0, 0) }
      },
      transparent: true,
      depthWrite: true
    });
  const nearMat = makeMat(fine ? 1 : 0);
  const near = new THREE.Mesh(new THREE.PlaneGeometry(fineSize, fineSize, segments, segments).rotateX(-Math.PI / 2), nearMat);
  near.position.set(CARRIER_ORIGIN.x, 0, CARRIER_ORIGIN.z);
  near.frustumCulled = false;
  const farMat = makeMat(0);
  const far = new THREE.Mesh(frameGeometry(60000, fineSize - 4), farMat);
  far.position.set(CARRIER_ORIGIN.x, -0.15, CARRIER_ORIGIN.z);
  far.frustumCulled = false;
  group.add(near, far);
  return { group, materials: [nearMat, farMat] };
}

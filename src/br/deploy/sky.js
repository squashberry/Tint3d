// Procedural golden-hour sky dome, drifting cloud puffs and shared atmosphere colours.

import * as THREE from 'three';
import { SUN_DIR } from './constants.js';
import { FX } from './effects.js';

export const ATMOS = {
  sun: new THREE.Vector3(...SUN_DIR).normalize(),
  sunColor: new THREE.Color(0xffd9a8),
  horizon: new THREE.Color(0xf6cfa8),
  zenith: new THREE.Color(0x2c78c8),
  fog: new THREE.Color(0xb8d0e2),
  deepWater: new THREE.Color(0x0b3f66),
  shallowWater: new THREE.Color(0x1aa7b8)
};

export const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform float uTime;
uniform float uCloudAmt;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.32 + pow(sd, 64.0) * 0.8 + smoothstep(0.9993, 0.9998, sd) * 6.0);
  col = mix(col, uHorizon, exp(-h * 9.0) * 0.55);
  if (d.y > 0.015) {
    vec2 uv = d.xz / (d.y + 0.14) * 1.15 + vec2(uTime * 0.004, 0.0);
    float c = fbm(uv * 1.6);
    float cov = smoothstep(0.55 - uCloudAmt * 0.14, 0.8, c);
    vec2 sdir = normalize(uSun.xz + 0.0001);
    float lit = clamp(dot(sdir, normalize(d.xz + 0.0001)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 cc = mix(vec3(0.5, 0.56, 0.72), vec3(1.0, 0.9, 0.78), lit * 0.75 + 0.25 * h);
    float fade = smoothstep(0.015, 0.2, d.y);
    col = mix(col, cc, cov * fade * 0.92);
  }
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.4, clamp(-d.y * 6.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyDome(radius = 12000) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uSun: { value: ATMOS.sun },
      uSunColor: { value: ATMOS.sunColor },
      uHorizon: { value: ATMOS.horizon },
      uZenith: { value: ATMOS.zenith },
      uTime: FX.uTime,
      uCloudAmt: { value: 0.5 }
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), mat);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

const CL_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aScale;
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
varying float vDist;
varying float vHeight;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = aCenter + (right * position.x * aScale.x + up * position.y * aScale.y);
  vUv = position.xy * 2.0;
  vSeed = aSeed;
  vDist = length(wp - cameraPosition);
  vHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const CL_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying float vSeed;
varying float vDist;
varying float vHeight;
${NOISE_GLSL}
void main() {
  float r = length(vUv * vec2(0.9, 1.3));
  float n = fbm(vUv * 2.2 + vSeed * 17.0 + uTime * 0.01);
  float shape = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.9);
  float light = clamp(0.55 + vHeight * 0.9 + uSun.y * 0.2, 0.0, 1.0);
  vec3 col = mix(vec3(0.58, 0.62, 0.76), vec3(1.0, 0.93, 0.84), light);
  float fogF = smoothstep(2500.0, 9000.0, vDist);
  col = mix(col, uFog, fogF * 0.8);
  float near = smoothstep(40.0, 260.0, vDist);
  gl_FragColor = vec4(col, shape * uOpacity * near);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CloudField {
  constructor(count, { center = [0, 0, 0], radius = 6000, minY = 180, maxY = 900 } = {}) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    const c = new Float32Array(count * 3);
    const s = new Float32Array(count * 2);
    const seed = new Float32Array(count);
    let st = 12345;
    const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      c[i * 3] = center[0] + Math.cos(a) * r;
      c[i * 3 + 1] = minY + Math.pow(rnd(), 1.6) * (maxY - minY);
      c[i * 3 + 2] = center[2] + Math.sin(a) * r;
      const w = 220 + rnd() * 380;
      s[i * 2] = w;
      s[i * 2 + 1] = w * (0.45 + rnd() * 0.25);
      seed[i] = rnd();
    }
    g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(c, 3));
    g.setAttribute('aScale', new THREE.InstancedBufferAttribute(s, 2));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      vertexShader: CL_VERT,
      fragmentShader: CL_FRAG,
      uniforms: { uSun: { value: ATMOS.sun }, uFog: { value: ATMOS.fog }, uTime: FX.uTime, uOpacity: { value: 0.85 } },
      transparent: true,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'clouds';
  }
}

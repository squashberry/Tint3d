// Sky dome (gradient, sun, high cirrus, haze) plus drifting cumulus puffs for Splat Island.
// The dome follows the camera; clouds are instanced billboards (one draw call) animated entirely in the vertex shader.
//
//   const sky = createAtmosphere({ clouds: 40, sunDirection: sun.position.clone().normalize() });
//   scene.add(sky.group);  scene.fog = new THREE.Fog(sky.fogColor, 900, 5200);
//   sky.update(timeSeconds, camera);   // every frame (also keeps camera.far large enough for the dome)

import * as THREE from 'three';

const NOISE = /* glsl */ `
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
  for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}`;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const DOME_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform float uTime;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.28 + pow(sd, 60.0) * 0.8 + smoothstep(0.9993, 0.9998, sd) * 6.0);
  col = mix(col, uHorizon, exp(-h * 8.0) * 0.6);
  if (d.y > 0.02) {
    vec2 uv = d.xz / (d.y + 0.16);
    float cir = fbm(vec2(uv.x * 0.5 + uTime * 0.004, uv.y * 2.6));
    float cirrus = smoothstep(0.55, 0.9, cir) * smoothstep(0.05, 0.4, d.y) * 0.4;
    col = mix(col, vec3(1.0, 0.97, 0.93), cirrus);
    float c = fbm(uv * 1.5 + vec2(uTime * 0.006, 3.0));
    float cov = smoothstep(0.58, 0.82, c) * smoothstep(0.02, 0.22, d.y);
    col = mix(col, mix(vec3(0.62, 0.68, 0.8), vec3(1.0, 0.97, 0.92), 0.55 + 0.45 * h), cov * 0.75);
  }
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-d.y * 6.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CLOUD_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aScale;
attribute float aSeed;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vDist;
varying float vH;
void main() {
  vec3 c = aCenter;
  c.x = mod(c.x + uTime * (2.0 + aSeed * 3.0) + 7000.0, 14000.0) - 7000.0;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + right * position.x * aScale.x + up * position.y * aScale.y;
  vUv = position.xy * 2.0;
  vSeed = aSeed;
  vH = position.y;
  vDist = length(wp - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const CLOUD_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vDist;
varying float vH;
${NOISE}
void main() {
  float r = length(vUv * vec2(0.85, 1.25));
  float n = fbm(vUv * 2.1 + vSeed * 19.0 + uTime * 0.01);
  float shape = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.95);
  float light = clamp(0.5 + vH * 0.95 + uSun.y * 0.25, 0.0, 1.0);
  vec3 col = mix(vec3(0.6, 0.65, 0.78), vec3(1.0, 0.97, 0.92), light);
  col = mix(col, uFog, smoothstep(2200.0, 8500.0, vDist) * 0.75);
  float nearFade = smoothstep(120.0, 600.0, vDist);
  gl_FragColor = vec4(col, shape * 0.9 * nearFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createAtmosphere({ clouds = 40, sunDirection = new THREE.Vector3(0.5, 0.62, -0.6), detail = 4 } = {}) {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const sun = sunDirection.clone().normalize();
  const horizon = new THREE.Color(0xcfe3f2);
  const zenith = new THREE.Color(0x3d86d8);
  const sunColor = new THREE.Color(0xfff0d0);
  const fogColor = new THREE.Color(0xc4dcec);
  const timeU = { value: 0 };
  const defs = { OCT: detail };

  const domeMat = new THREE.ShaderMaterial({
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    defines: defs,
    uniforms: { uSun: { value: sun }, uSunColor: { value: sunColor }, uHorizon: { value: horizon }, uZenith: { value: zenith }, uTime: timeU },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 20), domeMat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  dome.name = 'skyDome';
  group.add(dome);

  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    defines: defs,
    uniforms: { uSun: { value: sun }, uFog: { value: fogColor }, uTime: timeU },
    transparent: true,
    depthWrite: false
  });
  let cloudMesh = null;
  let cloudCount = -1;

  function buildClouds(nClusters) {
    if (cloudMesh) { group.remove(cloudMesh); cloudMesh.geometry.dispose(); cloudMesh = null; }
    cloudCount = nClusters;
    if (nClusters <= 0) return;
    const per = 5;
    const N = nClusters * per;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    const c = new Float32Array(N * 3);
    const s = new Float32Array(N * 2);
    const sd = new Float32Array(N);
    let st = 987654;
    const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
    let i = 0;
    for (let k = 0; k < nClusters; k++) {
      const low = k % 3 === 0; // a third sit low and far, on the horizon
      const a = rnd() * Math.PI * 2;
      const rad = low ? 2800 + rnd() * 3800 : Math.sqrt(rnd()) * 5200;
      const cx = Math.cos(a) * rad;
      const cz = Math.sin(a) * rad;
      const cy = low ? 240 + rnd() * 260 : 560 + rnd() * 560;
      const size = low ? 320 + rnd() * 380 : 240 + rnd() * 330;
      for (let j = 0; j < per; j++, i++) {
        const oa = rnd() * Math.PI * 2;
        const or = rnd() * size * 0.9;
        c[i * 3] = cx + Math.cos(oa) * or;
        c[i * 3 + 1] = cy + (rnd() - 0.4) * size * 0.25;
        c[i * 3 + 2] = cz + Math.sin(oa) * or;
        const w = size * (0.6 + rnd() * 0.7);
        s[i * 2] = w;
        s[i * 2 + 1] = w * (0.5 + rnd() * 0.22);
        sd[i] = rnd();
      }
    }
    g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(c, 3));
    g.setAttribute('aScale', new THREE.InstancedBufferAttribute(s, 2));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
    g.instanceCount = N;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    cloudMesh = new THREE.Mesh(g, cloudMat);
    cloudMesh.frustumCulled = false;
    cloudMesh.renderOrder = 5;
    cloudMesh.name = 'clouds';
    group.add(cloudMesh);
  }
  buildClouds(clouds);

  return {
    group,
    fogColor,
    horizon,
    sun,
    setCloudCount(n) { if (n !== cloudCount) buildClouds(n); },
    get cloudCount() { return cloudCount; },
    // Make sure the camera can actually see the dome and the clouds (the arena camera far plane is tiny).
    configureCamera(camera, far = 9500) { if (camera.far < far) { camera.far = far; camera.updateProjectionMatrix(); } },
    update(t, camera) {
      timeU.value = t;
      dome.position.copy(camera.position);
      dome.scale.setScalar((Math.min(camera.far, 9500) * 0.92) / 1000);
    },
    dispose() { dome.geometry.dispose(); domeMat.dispose(); cloudMat.dispose(); cloudMesh?.geometry.dispose(); }
  };
}

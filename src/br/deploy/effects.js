// Reusable lightweight effects: light points, particles, exhaust, canvas textures.

import * as THREE from 'three';

export const FX = {
  uPx: { value: 700 }, // pixels per metre at 1 m distance (updated from the active camera)
  uTime: { value: 0 }
};

export function updateFxView(camera, heightPx) {
  FX.uPx.value = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (draw) draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

// Flat or vertical text decal (PlaneGeometry; rotate/position it yourself).
export function textPlane(text, w, h, { color = '#ffffff', px = 128, bg = null, align = 'center', weight = 'bold' } = {}) {
  const cw = 1024;
  const ch = Math.max(64, Math.round(cw * (h / w)));
  const { texture } = canvasTexture(cw, ch, (ctx) => {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch); }
    ctx.fillStyle = color;
    ctx.font = `${weight} ${Math.round(px * (ch / 256))}px "Rajdhani","Bahnschrift","Arial Narrow",Arial,sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, align === 'center' ? cw / 2 : 16, ch / 2 + 4, cw - 32);
  });
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// ------------------------------------------------------------------ light points
const LP_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute vec2 aAnim;
uniform float uTime;
uniform float uPx;
uniform float uMaster;
varying vec3 vColor;
varying float vI;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float kind = aAnim.x;
  float ph = aAnim.y;
  float inten = 1.0;
  if (kind < 0.5) {
    inten = 1.0;
  } else if (kind < 1.5) {
    float c = fract(uTime * 0.9 - ph * 0.011);
    inten = pow(max(0.0, 1.0 - c * 6.0), 2.0) * 1.6 + 0.22;
  } else if (kind < 2.5) {
    float c = fract(uTime * 0.8 + ph);
    inten = step(c, 0.07) * 2.2 + 0.03;
  } else if (kind < 3.5) {
    inten = 0.55 + 0.45 * sin(uTime * 2.2 + ph);
  } else {
    inten = step(0.5, fract(uTime * 1.6 + ph)) * 1.5 + 0.08;
  }
  vI = inten * uMaster;
  vColor = aColor;
  float size = aSize * uPx / max(0.5, -mv.z);
  gl_PointSize = clamp(size, 1.5, 72.0);
  gl_Position = projectionMatrix * mv;
}`;
const LP_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vI;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  float core = smoothstep(0.4, 0.0, d);
  vec3 col = vColor * vI * (a + core * 1.3);
  gl_FragColor = vec4(col, a * clamp(vI, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// kind: 0 steady, 1 chase (phase = distance along the run), 2 strobe, 3 pulse, 4 warning flash
export class LightPoints {
  constructor(items, { name = 'lights' } = {}) {
    const n = items.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const anim = new Float32Array(n * 2);
    const c = new THREE.Color();
    items.forEach((it, i) => {
      pos.set(it.p, i * 3);
      c.set(it.color ?? 0xffffff);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = it.size ?? 0.8;
      anim[i * 2] = it.kind ?? 0;
      anim[i * 2 + 1] = it.phase ?? 0;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      vertexShader: LP_VERT,
      fragmentShader: LP_FRAG,
      uniforms: { uTime: FX.uTime, uPx: FX.uPx, uMaster: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = name;
    this.points.frustumCulled = false;
  }
  setMaster(v) { this.material.uniforms.uMaster.value = v; }
}

// ------------------------------------------------------------------ CPU particles
const PS_VERT = /* glsl */ `
attribute vec4 aLife;
attribute vec4 aCol;
uniform float uPx;
varying vec4 vCol;
void main() {
  float t = clamp(aLife.x / max(aLife.y, 0.001), 0.0, 1.0);
  float size = mix(aLife.z, aLife.w, t);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * uPx / max(0.5, -mv.z), 1.0, 200.0);
  gl_Position = projectionMatrix * mv;
  float vis = step(aLife.x, aLife.y);
  vCol = vec4(aCol.rgb, aCol.a * pow(1.0 - t, 1.4) * vis * smoothstep(0.0, 0.06, t));
}`;
const PS_FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const _c = new THREE.Color();

export class ParticleSystem {
  constructor({ max = 200, additive = false, gravity = 0, drag = 0.5, name = 'particles' } = {}) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max * 4);
    this.col = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) { this.life[i * 4] = 2; this.life[i * 4 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PS_VERT,
      fragmentShader: PS_FRAG,
      uniforms: { uPx: FX.uPx },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.name = name;
  }
  emit(x, y, z, vx, vy, vz, life, size0, size1, color, alpha = 0.6) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i * 4] = 0; this.life[i * 4 + 1] = life; this.life[i * 4 + 2] = size0; this.life[i * 4 + 3] = size1;
    const c = _c.set(color);
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = alpha;
  }
  update(dt) {
    const { pos, vel, life, max } = this;
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < max; i++) {
      const a = life[i * 4];
      if (a > life[i * 4 + 1]) continue;
      life[i * 4] = a + dt;
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - this.gravity * dt; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aCol.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ engine exhaust (shader cone towards -X)
const EX_VERT = /* glsl */ `
uniform float uTime;
uniform float uLen;
uniform float uRad;
varying float vU;
varying float vAng;
void main() {
  float u = position.x;
  float r = uRad * (1.0 - 0.38 * u + 0.07 * sin(u * 40.0 - uTime * 30.0));
  vec3 p = vec3(-u * uLen, position.y * r, position.z * r);
  vU = u;
  vAng = atan(position.z, position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const EX_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform float uAlpha;
uniform vec3 uCore;
uniform vec3 uEdge;
varying float vU;
varying float vAng;
void main() {
  float core = pow(1.0 - vU, 2.0);
  float flick = 0.72 + 0.28 * sin(vU * 36.0 - uTime * 55.0 + vAng * 2.0);
  float diamonds = pow(abs(sin(vU * 22.0 - 1.2)), 8.0) * (1.0 - vU) * uPower;
  vec3 col = mix(uEdge, uCore, core) + diamonds * vec3(0.7, 0.85, 1.0);
  float a = (core * 0.9 + 0.08) * flick * uPower * uAlpha;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createExhaust({ radius = 1.4, length = 14, core = 0xcfe9ff, edge = 0x4a6bff, alpha = 1, segs = 14, ring = 16 } = {}) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      pos.push(i / segs, Math.cos(a), Math.sin(a));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-length / 2, 0, 0), length);
  const mat = new THREE.ShaderMaterial({
    vertexShader: EX_VERT,
    fragmentShader: EX_FRAG,
    uniforms: {
      uTime: FX.uTime,
      uLen: { value: length },
      uRad: { value: radius },
      uPower: { value: 0 },
      uAlpha: { value: alpha },
      uCore: { value: new THREE.Color(core) },
      uEdge: { value: new THREE.Color(edge) }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.baseLength = length;
  return mesh;
}

export function setExhaust(mesh, power, lenScale = 1) {
  mesh.visible = power > 0.02;
  const u = mesh.material.uniforms;
  u.uPower.value = power;
  u.uLen.value = mesh.userData.baseLength * (0.35 + 0.65 * power) * lenScale;
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

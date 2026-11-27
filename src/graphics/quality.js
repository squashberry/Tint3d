// Graphics quality tiers with automatic adjustment.
// AUTO starts from a device-based guess and moves up or down based on measured frame time.
// LOW / MEDIUM / HIGH / VERY HIGH / MAX can be forced from the GFX button.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const TIER_ORDER = ['optimised', 'low', 'medium', 'high', 'veryhigh', 'max'];
export const TIER_LABEL = { auto: 'AUTO', optimised: 'OPTIMISED', low: 'LOW', medium: 'MEDIUM', high: 'HIGH', veryhigh: 'VERY HIGH', max: 'MAX' };

const TIERS = {
  optimised: { pixel: 0.6, shadow: 0, aniso: 1, bloom: 0, grade: false, env: 0, fx: 0.3, dust: 0, msaa: 0 },
  low:      { pixel: 0.85, shadow: 0,    aniso: 2,  bloom: 0,    grade: false, env: 0,    fx: 0.5,  dust: 0,   msaa: 0 },
  medium:   { pixel: 1.0,  shadow: 1024, aniso: 4,  bloom: 0,    grade: false, env: 0.38, fx: 0.75, dust: 0,   msaa: 0 },
  high:     { pixel: 1.25, shadow: 1536, aniso: 8,  bloom: 0.26, grade: true,  env: 0.5,  fx: 1.0,  dust: 90,  msaa: 4 },
  veryhigh: { pixel: 1.6,  shadow: 2048, aniso: 12, bloom: 0.34, grade: true,  env: 0.58, fx: 1.25, dust: 180, msaa: 4 },
  max:      { pixel: 2.0,  shadow: 3072, aniso: 16, bloom: 0.42, grade: true,  env: 0.66, fx: 1.5,  dust: 260, msaa: 4 }
};

const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.28 }, saturation: { value: 1.1 }, contrast: { value: 1.05 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float saturation; uniform float contrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.18) * contrast + 0.18;
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.95, length(d) * 1.35);
      gl_FragColor = c;
    }`
};

/**
 * Rough hardware score from the GPU name, CPU cores and memory. Old integrated GPUs (Intel HD 2000-4000
 * class), software renderers and small phones start on OPTIMISED, mid devices on LOW / MEDIUM.
 */
function detectProfile(renderer, isTouch) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { /* unknown GPU */ }
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  let score = 0;
  if (/SwiftShader|llvmpipe|Basic Render|Mali-4|Mali-T[0-6]|Adreno \(TM\) [2-4]\d\d|PowerVR|HD Graphics [2-4]\d{3}|GMA/i.test(gpu)) score += 2;
  else if (/Intel/i.test(gpu) && !/Iris|Xe|Arc|UHD Graphics 6/i.test(gpu)) score += 1;
  if (cores <= 2) score += 2; else if (cores <= 4) score += 1;
  if (memory <= 2) score += 2; else if (memory <= 4) score += 1;
  if (isTouch && Math.min(screen.width, screen.height) * (devicePixelRatio || 1) > 1400 && cores <= 6) score += 0.5;
  const software = /SwiftShader|llvmpipe|Basic Render/i.test(gpu);
  if (score >= 3) return { score, gpu, software, start: 'optimised', cap: 'low' };
  if (score >= 2) return { score, gpu, software, start: 'low', cap: 'medium' };
  if (isTouch) return { score, gpu, software, start: 'medium', cap: 'high' };
  return { score, gpu, software, start: 'high', cap: 'veryhigh' };
}

/** True when the GPU looks weak or software-rendered (used to skip MSAA before the renderer exists). */
export function isWeakGpu() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|Basic Render|HD Graphics [2-5]\d{3}|GMA|Mali-4|PowerVR/i.test(gpu) || (navigator.hardwareConcurrency || 4) <= 2;
  } catch { return true; }
}

export class QualityManager {
  constructor({ renderer, scene, camera, sun, isTouch, onFx }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sun = sun;
    this.isTouch = isTouch;
    this.onFx = onFx || (() => {});
    this.composer = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.envTexture = null;
    this.dust = null;
    this.preference = 'auto';
    try { this.preference = localStorage.getItem('tint3d.quality') || 'auto'; } catch { /* storage is optional */ }
    if (this.preference !== 'auto' && !TIERS[this.preference]) this.preference = 'auto';
    this.profile = detectProfile(renderer, isTouch);
    this.autoCap = this.profile.cap;
    this.dynScale = this.profile.software && this.tier === 'optimised' ? 0.6 : 1;
    this.fps = 60;
    this.cheap = false;
    this.scanTimer = 0;
    this.dynMin = this.profile.software ? 0.3 : 0.5;
    this.lite = false;
    this.tier = this.preference === 'auto' ? this.profile.start : this.preference;
    this.frames = [];
    this.lastStamp = performance.now();
    this.goodWindows = 0;
    this.cooldown = 3;
    this.width = innerWidth;
    this.height = innerHeight;
    this.apply(this.tier);
  }

  get label() {
    return this.preference === 'auto' ? 'AUTO · ' + TIER_LABEL[this.tier] : TIER_LABEL[this.tier];
  }

  cyclePreference() {
    const order = ['auto', ...TIER_ORDER];
    this.setPreference(order[(order.indexOf(this.preference) + 1) % order.length]);
    return this.label;
  }

  setPreference(pref) {
    this.preference = pref;
    try { localStorage.setItem('tint3d.quality', pref); } catch { /* optional */ }
    this.apply(pref === 'auto' ? this.profile.start : pref);
    this.goodWindows = 0;
    this.cooldown = 3;
  }

  ensureEnvironment() {
    if (this.envTexture) return;
    const sky = new THREE.Scene();
    const colors = [];
    const geometry = new THREE.SphereGeometry(50, 32, 16);
    const position = geometry.attributes.position;
    const top = new THREE.Color(0x4aa9f0);
    const horizon = new THREE.Color(0xdff3ff);
    const ground = new THREE.Color(0x5f7a75);
    const tmp = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i) / 50;
      if (y > 0) tmp.copy(horizon).lerp(top, Math.pow(y, 0.6));
      else tmp.copy(horizon).lerp(ground, Math.min(1, -y * 1.6));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    sky.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d0).multiplyScalar(7) }));
    sunDisc.position.set(-22, 34, 20);
    sky.add(sunDisc);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(sky, 0.02).texture;
    pmrem.dispose();
    geometry.dispose();
  }

  ensureDust() {
    if (this.dust) return;
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.12, transparent: true, opacity: 0.38, depthWrite: false, sizeAttenuation: true, fog: true });
    this.dust = new THREE.Points(geometry, material);
    this.dust.frustumCulled = false;
    this.dust.layers.disable(1);
    this.scene.add(this.dust);
  }

  buildComposer(settings) {
    const size = this.renderer.getSize(new THREE.Vector2());
    const ratio = this.renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * ratio, size.y * ratio, { type: THREE.HalfFloatType, samples: settings.msaa });
    const composer = new EffectComposer(this.renderer, target);
    composer.setPixelRatio(ratio);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x * 0.5, size.y * 0.5), settings.bloom, 0.55, 0.82);
    composer.addPass(this.bloomPass);
    this.gradePass = new ShaderPass(GRADE_SHADER);
    composer.addPass(this.gradePass);
    composer.addPass(new OutputPass());
    this.composer?.dispose?.();
    this.composer = composer;
  }

  apply(tierName) {
    const settings = TIERS[tierName];
    this.tier = tierName;
    const dynTier = tierName === 'optimised' || (tierName === 'low' && this.profile.score >= 2);
    if (!dynTier) this.dynScale = 1;
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, settings.pixel) * this.dynScale);
    r.setSize(this.width, this.height);

    const wantShadow = settings.shadow > 0;
    if (r.shadowMap.enabled !== wantShadow) {
      r.shadowMap.enabled = wantShadow;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    if (wantShadow && this.sun.shadow.mapSize.x !== settings.shadow) {
      this.sun.shadow.mapSize.set(settings.shadow, settings.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = wantShadow;

    if (settings.env > 0) {
      this.ensureEnvironment();
      this.scene.environment = this.envTexture;
      this.scene.environmentIntensity = settings.env;
    } else {
      this.scene.environment = null;
    }

    const maxAniso = Math.min(settings.aniso, r.capabilities.getMaxAnisotropy());
    this.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        for (const key of ['map', 'bumpMap', 'roughnessMap', 'normalMap', 'clearcoatMap']) {
          if (m[key] && m[key].anisotropy !== maxAniso) { m[key].anisotropy = maxAniso; m[key].needsUpdate = true; }
        }
      }
    });

    if (settings.bloom > 0) {
      if (!this.composer || this.composer.renderTarget1.samples !== settings.msaa) this.buildComposer(settings);
      this.bloomPass.strength = settings.bloom;
      this.gradePass.enabled = settings.grade;
    } else {
      this.composer?.dispose?.();
      this.composer = null;
    }

    if (settings.dust > 0) {
      this.ensureDust();
      this.dust.visible = true;
      this.dust.geometry.setDrawRange(0, settings.dust);
    } else if (this.dust) {
      this.dust.visible = false;
    }
    // Low tiers also pull in the far plane and fog so distant geometry is never drawn.
    this.lite = tierName === 'optimised' || tierName === 'low';
    // Weak or software GPUs: swap every lit material for a cheap Lambert twin (no clear-coat/bump/PBR).
    this.setCheapMaterials(tierName === 'optimised' || this.profile.software || (tierName === 'low' && this.profile.score >= 2));
    if (this._farOrig === undefined) {
      this._farOrig = this.camera.far;
      this._fogFar = this.scene.fog?.far;
      this._fogNear = this.scene.fog?.near;
    }
    const far = tierName === 'optimised' ? 130 : tierName === 'low' ? 190 : this._farOrig;
    if (this.camera.far !== far) { this.camera.far = far; this.camera.updateProjectionMatrix(); }
    if (this.scene.fog) {
      this.scene.fog.far = tierName === 'optimised' ? 125 : tierName === 'low' ? 170 : this._fogFar;
      this.scene.fog.near = tierName === 'optimised' ? 40 : this._fogNear;
    }
    this.onFx(settings.fx);
  }

  swapMaterials(on) {
    if (!this.twins) this.twins = new WeakMap();
    const cheapOf = (m) => {
      let twin = this.twins.get(m);
      if (!twin) {
        twin = new THREE.MeshLambertMaterial({
          color: m.color.clone(), map: m.map || null, emissive: m.emissive.clone().multiplyScalar(Math.min(1.5, m.emissiveIntensity || 1)),
          transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, vertexColors: m.vertexColors, fog: true
        });
        twin.userData.original = m;
        this.twins.set(m, twin);
      }
      return twin;
    };
    this.scene.traverse((o) => {
      if (!o.material || o.isPoints || o.isSprite) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const next = list.map((m) => {
        if (on && m.isMeshStandardMaterial) return cheapOf(m);
        if (!on && m.userData?.original) return m.userData.original;
        return m;
      });
      if (next.some((m, i) => m !== list[i])) o.material = Array.isArray(o.material) ? next : next[0];
    });
  }

  setCheapMaterials(on) {
    this.cheapWanted = on;
    if (on === this.cheap) return;
    this.cheap = on;
    this.swapMaterials(on);
    this.scanTimer = 0;
  }

  /** Re-apply the pixel ratio after the dynamic resolution scale changed. */
  refreshPixelRatio() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TIERS[this.tier].pixel) * this.dynScale);
    this.renderer.setSize(this.width, this.height);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TIERS[this.tier].pixel) * this.dynScale);
    this.renderer.setSize(width, height);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
  }

  /** Call once per frame: samples frame time and, in AUTO, steps the tier up or down. */
  update(focus) {
    const now = performance.now();
    const dt = now - this.lastStamp;
    this.lastStamp = now;
    if (dt > 0 && dt < 1000) this.fps = this.fps * 0.92 + (1000 / dt) * 0.08;
    if (this.cheap) {
      this.scanTimer += dt / 1000;
      if (this.scanTimer > 2) { this.scanTimer = 0; this.swapMaterials(true); }
    }
    if (this.dust?.visible && focus) {
      const t = now * 0.00004;
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < 260; i++) {
        const x = p.getX(i) + Math.sin(t * 7 + i) * 0.004;
        let y = p.getY(i) + 0.003 + Math.sin(t * 5 + i * 1.7) * 0.002;
        const z = p.getZ(i) + Math.cos(t * 6 + i) * 0.004;
        if (y > 14) y = 0;
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
      this.dust.position.set(Math.round(focus.x / 30) * 30, 0, Math.round(focus.z / 30) * 30);
    }
    if (this.preference !== 'auto' || dt > 250) return;
    this.frames.push(dt);
    if (this.cooldown > 0) { this.cooldown -= dt / 1000; this.frames.length = 0; return; }
    if (this.frames.length < 90) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.frames.length = 0;
    const index = TIER_ORDER.indexOf(this.tier);
    // OPTIMISED also scales the render resolution live (down to 50%) to hold a playable frame rate.
    const dynTier = this.tier === 'optimised' || (this.tier === 'low' && this.profile.score >= 2);
    if (dynTier && avg > 30 && this.dynScale > this.dynMin) {
      this.dynScale = Math.max(this.dynMin, this.dynScale - (this.profile.software ? 0.15 : 0.08));
      this.refreshPixelRatio();
      this.cooldown = 1.5;
      return;
    }
    if (dynTier && avg < 17 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.05);
      this.refreshPixelRatio();
      return;
    }
    if (avg > 24 && index > 0) {
      this.apply(TIER_ORDER[index - 1]);
      this.goodWindows = 0;
      this.cooldown = 4;
    } else if (avg < 15.8 && index < TIER_ORDER.indexOf(this.autoCap)) {
      this.goodWindows++;
      if (this.goodWindows >= 3) { this.apply(TIER_ORDER[index + 1]); this.goodWindows = 0; this.cooldown = 4; }
    } else {
      this.goodWindows = 0;
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

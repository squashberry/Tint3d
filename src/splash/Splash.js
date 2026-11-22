// Tint3d cinematic splash: a real Tint3d operator walks up, makes eye contact, grabs a paint bomb
// and hurls it at the player's screen. The impact floods the display with thick rubbery paint that
// pulls back to reveal a living, pixel-shifting loading illustration. Loading progress is real.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createOperatorGroup } from '../operators/index.js';
import { rotateBoneWorld, solveTwoBone } from '../operators/ik.js';
import { PaintScreen } from './paintScreen.js';
import { paintArtwork } from './artwork.js';
import { createSplashAudio } from './splashAudio.js';

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2.2);
const UP = new THREE.Vector3(0, 1, 0);

// Timeline (seconds of cinematic time)
const T = {
  walkEnd: 2.2, reach: 2.25, grab: 2.72, inspect: 2.72, activate: 3.05, lookAgain: 3.22,
  windup: 3.4, swing: 3.74, release: 3.9, follow: 4.35, flightEnd: 4.5, artAt: 5.05
};

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = `
  precision highp float;
  uniform sampler2D uTex; uniform vec2 uRes; uniform float uTexAspect;
  vec2 coverUv(vec2 uv) {
    float sa = uRes.x / uRes.y; float ta = uTexAspect;
    vec2 s = sa > ta ? vec2(1.0, ta / sa) : vec2(sa / ta, 1.0);
    return (uv - 0.5) * s + 0.5;
  }
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 h22(vec2 p) { return vec2(h21(p), h21(p + 19.19)); }
`;
const ART_FRAG = COMMON + `
  uniform float uTime; uniform float uIntensity; uniform float uCalm; uniform vec2 uImpact; uniform float uImpactT; uniform float uEcho; uniform float uFx;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float I = uIntensity * (1.0 - uCalm);
    float t = uTime;
    float slice = floor(t * 7.0);
    float slice2 = floor(t * 3.0);
    vec2 px = 1.0 / uRes;
    // liquid ripples travelling through the picture (subtle, always on)
    uv += I * 0.0022 * vec2(sin(uv.y * 34.0 + t * 1.7) + sin(uv.y * 13.0 - t * 1.1), cos(uv.x * 27.0 + t * 1.4));
    // echoes of the original paint-bomb impact
    vec2 d = (uv - uImpact) * vec2(uRes.x / uRes.y, 1.0);
    float dist = length(d);
    float ring = exp(-pow((dist - uImpactT * 0.6) * 9.0, 2.0)) * exp(-uImpactT * 0.55) * step(0.0, uImpactT);
    uv += normalize(d + 1e-4) * ring * 0.012 * (1.0 - uCalm) * uEcho;
    // micro displacement of small pixel clusters
    vec2 cell = floor(uv * uRes / 6.0);
    float hc = h21(cell + slice);
    uv += step(0.93, hc) * (h22(cell + slice * 1.7) - 0.5) * px * 7.0 * I;
    // occasional rectangular block shifts
    vec2 blk = floor(uv * vec2(22.0, 12.0));
    float hb = h21(blk + slice2 * 3.1);
    uv.x += step(0.965, hb) * (h21(blk + 7.0) - 0.5) * 0.03 * I;
    // horizontal glitch band sweeps (gated so calm periods follow strong waves)
    float gate = smoothstep(0.62, 0.9, sin(t * 0.9) * 0.5 + 0.5 + 0.35 * sin(t * 2.3 + 1.7));
    float band = fract(t * 0.21);
    float bandMask = 1.0 - smoothstep(0.04, 0.07, abs(uv.y - band));
    uv.x += bandMask * gate * (sin(uv.y * 160.0 + t * 20.0) * 0.018 + (h21(vec2(floor(uv.y * 90.0), slice)) - 0.5) * 0.024) * I * uFx;
    // pixel sorting smear on a few rows
    float row = floor(uv.y * uRes.y / 5.0);
    float sortMask = step(0.985, h21(vec2(row, slice2))) * I * uFx;
    float seg = floor(uv.x * 12.0) / 12.0;
    uv.x = mix(uv.x, seg + h21(vec2(row, seg)) * 0.09, sortMask * 0.85);
    // tiny RGB-separated clusters that snap back
    float split = step(0.972, h21(floor(uv * uRes / 11.0) + slice * 2.3)) * I * uFx;
    vec2 off = vec2(px.x * (3.0 + 4.0 * h21(cell)), 0.0) * split + vec2(ring * 0.004, 0.0) * uEcho;
    vec3 col;
    col.r = texture2D(uTex, coverUv(uv + off)).r;
    col.g = texture2D(uTex, coverUv(uv)).g;
    col.b = texture2D(uTex, coverUv(uv - off)).b;
    col *= 1.0 - 0.22 * smoothstep(0.45, 0.95, length(vUv - 0.5) * 1.25);
    gl_FragColor = vec4(col, 1.0);
  }
`;
const PARTICLE_VERT = COMMON + `
  attribute vec3 aSeed; uniform float uTime; uniform float uIntensity; uniform float uCalm; uniform float uSize;
  varying vec3 vCol; varying float vA;
  void main() {
    float ph = fract(uTime * 0.18 + aSeed.z);
    vec2 p = aSeed.xy + vec2(sin(aSeed.z * 40.0 + uTime) * 0.02, ph * 0.14);
    vA = sin(3.14159 * ph) * (1.0 - uCalm) * uIntensity;
    vCol = texture2D(uTex, coverUv(aSeed.xy)).rgb;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed.z) * uRes.y / 720.0;
  }
`;
const PARTICLE_FRAG = 'precision highp float; varying vec3 vCol; varying float vA; void main() { gl_FragColor = vec4(vCol, vA); }';

export class Splash {
  constructor({ root, tracker }) {
    this.root = root;
    this.tracker = tracker;
    this.dom = {
      canvas: root.querySelector('#splash-canvas'), paint: root.querySelector('#splash-paint'),
      fill: root.querySelector('#splash-fill'), label: root.querySelector('#splash-label'),
      drop: root.querySelector('#splash-drop'), skip: root.querySelector('#splash-skip'), sound: root.querySelector('#splash-sound'),
      logo: root.querySelector('.splash-logo')
    };
    this.audio = createSplashAudio({ isOn: () => { try { return localStorage.getItem('tint3d.sound') === '1'; } catch { return false; } } });
    this.phase = 'wait';
    this.t = 0;
    this.shown = 0;
    this.cues = new Set();
    this.disposed = false;
    this.rush = false;
    this.finishT = 0;
    this.stepClock = 0;
    this.stepIndex = 0;
    this.artTime = 0;
    this.impactT = -1;
    this.timeScale = 1;
    const weak = (navigator.hardwareConcurrency || 4) <= 3 || (navigator.deviceMemory || 4) <= 2 || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lite = weak;
    this.touch = matchMedia('(pointer: coarse)').matches;
  }

  start() {
    document.body.classList.add('splash-on');
    this.root.classList.add('boot');
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.onGesture = () => this.audio.unlock();
    addEventListener('pointerdown', this.onGesture, { passive: true });
    addEventListener('keydown', this.onGesture);
    this.dom.skip?.addEventListener('click', () => this.skip());
    this.dom.sound?.addEventListener('click', () => {
      try { localStorage.setItem('tint3d.sound', '1'); } catch { /* optional */ }
      this.dom.sound.classList.add('hidden');
      this.audio.unlock();
    });
    if (this.audio.enabled && this.dom.sound) this.dom.sound.classList.add('hidden');
    try {
      this.initGL();
      this.buildArt();
      this.paint = new PaintScreen(this.dom.paint);
      this.paint.resize(this.lite ? 0.75 : 1);
      this.paint.onBounce = () => this.audio.bounce();
      this.paint.onDrip = () => this.audio.drip();
      this.paint.onWobble = () => this.audio.wobble();
      this.buildStage();
    } catch (error) {
      console.warn('Splash 3D unavailable, using the lightweight splash.', error);
      this.fallback = true;
      this.phase = 'wait';
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  // ---------------------------------------------------------------- setup
  initGL() {
    const canvas = this.dom.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite && !this.touch, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.lite ? 0.85 : (this.touch ? 1.1 : 1.5)));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.lite && !this.touch;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0a0a1c, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 80);
    this.disposables = [];
    this.resize();
  }

  resize() {
    if (this.disposed) return;
    const w = innerWidth;
    const h = innerHeight;
    if (this.renderer) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.portrait = w < h * 0.9;
      this.baseFov = this.portrait ? 50 : 38;
      this.baseCamZ = this.portrait ? 8.6 : 6.2;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      if (this.artMaterial) this.artMaterial.uniforms.uRes.value.set(w, h);
      if (this.particleMaterial) this.particleMaterial.uniforms.uRes.value.set(w, h);
    }
    this.paint?.resize(this.lite ? 0.75 : 1);
  }

  track(object) { this.disposables.push(object); return object; }

  makeCanvasTexture(canvas, srgb = true) {
    const texture = this.track(new THREE.CanvasTexture(canvas));
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  buildArt() {
    const aw = this.lite ? 1024 : 1600;
    const canvas = paintArtwork(aw, Math.round(aw * 9 / 16));
    const texture = this.track(new THREE.CanvasTexture(canvas));
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.artTexture = texture;
    this.artScene = new THREE.Scene();
    this.artCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.artMaterial = this.track(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: ART_FRAG,
      uniforms: {
        uTex: { value: texture }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uTexAspect: { value: 16 / 9 }, uTime: { value: 0 },
        uIntensity: { value: 0 }, uCalm: { value: 0 }, uImpact: { value: new THREE.Vector2(0.5, 0.54) }, uImpactT: { value: -1 }, uEcho: { value: 1 },
        uFx: { value: this.lite ? 0 : 1 }
      },
      depthTest: false, depthWrite: false
    }));
    const quad = new THREE.Mesh(this.track(new THREE.PlaneGeometry(2, 2)), this.artMaterial);
    quad.frustumCulled = false;
    this.artScene.add(quad);
    // Tiny blocks that detach from the picture, float up and dissolve.
    const count = this.lite ? 24 : 64;
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { seeds[i * 3] = Math.random(); seeds[i * 3 + 1] = Math.random() * 0.8; seeds[i * 3 + 2] = Math.random(); }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.particleMaterial = this.track(new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uTex: this.artMaterial.uniforms.uTex, uRes: this.artMaterial.uniforms.uRes, uTexAspect: { value: 16 / 9 }, uTime: this.artMaterial.uniforms.uTime,
        uIntensity: this.artMaterial.uniforms.uIntensity, uCalm: this.artMaterial.uniforms.uCalm, uSize: { value: 9 }
      }
    }));
    const points = new THREE.Points(geometry, this.particleMaterial);
    points.frustumCulled = false;
    this.artScene.add(points);
  }

  buildStage() {
    const scene = this.scene;
    // Reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.track(env);

    // Backdrop: curved halftone panel behind the character
    const bg = document.createElement('canvas');
    bg.width = 1024; bg.height = 512;
    const g = bg.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#1c46c8'); grad.addColorStop(0.5, '#1ad0c8'); grad.addColorStop(1, '#ff6a3c');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    for (let y = 0; y < 512; y += 16) for (let x = (y / 16 % 2) * 8; x < 1024; x += 16) { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(8,10,40,0.55)';
    g.beginPath(); g.moveTo(0, 512); g.bezierCurveTo(250, 250, 520, 480, 1024, 220); g.lineTo(1024, 512); g.fill();
    const back = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(11, 11, 8, 64, 1, true, Math.PI * 0.5, Math.PI)),
      this.track(new THREE.MeshBasicMaterial({ map: this.makeCanvasTexture(bg), side: THREE.BackSide }))
    );
    back.position.set(0, 3, 2);
    scene.add(back);

    // Floor with painted rings
    const fl = document.createElement('canvas');
    fl.width = 512; fl.height = 512;
    const f = fl.getContext('2d');
    f.fillStyle = '#0c1430'; f.fillRect(0, 0, 512, 512);
    [['#1f8fff', 230, 14], ['#ff6a3c', 190, 10], ['#22dcec', 150, 6], ['#ff3f95', 110, 4]].forEach(([c, r, lw]) => { f.strokeStyle = c; f.lineWidth = lw; f.globalAlpha = 0.85; f.beginPath(); f.arc(256, 256, r, 0, 7); f.stroke(); });
    f.globalAlpha = 1;
    const floor = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(7, 72)),
      this.track(new THREE.MeshStandardMaterial({ map: this.makeCanvasTexture(fl), roughness: 0.28, metalness: 0.2 }))
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Lights
    scene.add(new THREE.HemisphereLight(0xaee0ff, 0x24103a, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(3.5, 6, 5);
    key.castShadow = this.renderer.shadowMap.enabled;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 5; key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rimBlue = new THREE.PointLight(0x2e7bff, 26, 14, 2); rimBlue.position.set(-3.2, 2.2, -1.5); scene.add(rimBlue);
    const rimOrange = new THREE.PointLight(0xff6a3c, 26, 14, 2); rimOrange.position.set(3.2, 2.2, -1.5); scene.add(rimOrange);

    // Paint bomb on a little pedestal
    this.bomb = this.makeBomb();
    this.pedestal = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.2, 0.24, 0.9, 24)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x23345c, roughness: 0.45, metalness: 0.35 }))
    );
    this.bombRest = new THREE.Vector3(-0.3, 0.9, 1.45);
    this.pedestal.position.set(this.bombRest.x, 0.45, this.bombRest.z);
    this.pedestal.castShadow = true;
    scene.add(this.pedestal);
    this.bomb.position.copy(this.bombRest).add(new THREE.Vector3(0, 0.17, 0));
    scene.add(this.bomb);

    // Flight trail
    this.trail = [];
    const trailGeo = this.track(new THREE.SphereGeometry(1, 10, 8));
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(trailGeo, this.track(new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0, depthWrite: false })));
      m.visible = false;
      scene.add(m);
      this.trail.push(m);
    }

    // The operator (real Tint3d character, shared assets)
    this.hero = createOperatorGroup({ team: 1, variation: 1, isPlayer: false, palette: { ink: 0x20d8e9, light: 0x7cf0ff, deep: 0x1692a8 } });
    this.hero.userData.character.weapon.visible = false;
    this.hero.traverse((n) => { if (n.isMesh) { n.castShadow = true; } });
    scene.add(this.hero);
    this.hero.visible = false;
    this.heroState = { position: new THREE.Vector3(-6.5, 0, -4.5), grounded: true, sliding: false, aimElevation: 0, recoil: 0, landImpact: 0 };
    this.heroPos = new THREE.Vector3();
    this.heroYaw = 0;
    this.heroLook = 0;
  }

  makeBomb() {
    const group = new THREE.Group();
    const shellMat = this.track(new THREE.MeshPhysicalMaterial({ color: 0x2f7dff, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.8 }));
    const shell = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.17, 32, 24)), shellMat);
    shell.scale.set(1, 0.94, 1);
    const coreMat = this.track(new THREE.MeshStandardMaterial({ color: 0xff7a3c, emissive: 0xff5a20, emissiveIntensity: 0.9, roughness: 0.3 }));
    const core = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.115, 24, 18)), coreMat);
    const capMat = this.track(new THREE.MeshStandardMaterial({ color: 0xffd02e, roughness: 0.3, metalness: 0.4 }));
    const cap = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.055, 0.07, 0.06, 20)), capMat);
    cap.position.y = 0.17;
    const ring = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.075, 0.014, 10, 24)), capMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    const fuse = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8)), this.track(new THREE.MeshStandardMaterial({ color: 0x333333 })));
    fuse.position.y = 0.26; fuse.rotation.z = 0.35;
    const sparkCanvas = document.createElement('canvas');
    sparkCanvas.width = sparkCanvas.height = 64;
    const sg = sparkCanvas.getContext('2d');
    const rg = sg.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, '#fff'); rg.addColorStop(0.3, '#ffd24a'); rg.addColorStop(1, 'rgba(255,100,20,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
    const spark = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.makeCanvasTexture(sparkCanvas), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    spark.position.set(0.03, 0.31, 0);
    spark.scale.setScalar(0.001);
    group.add(core, shell, cap, ring, fuse, spark);
    group.userData = { shellMat, coreMat, spark, core };
    group.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    return group;
  }

  // ---------------------------------------------------------------- frame loop
  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try { this.update(dt); this.render(); } catch (error) {
      console.warn('Splash error, continuing without the cinematic.', error);
      this.fallback = true;
      this.phase = 'art';
    }
  }

  update(dt) {
    // Real progress -> bar + labels
    const p = this.tracker.progress;
    this.shown += (p - this.shown) * Math.min(1, dt * 5);
    this.dom.fill.style.transform = `scaleX(${clamp(this.shown, 0.02, 1)})`;
    const label = p < 0.3 ? 'Preparing the paint...' : p < 0.62 ? 'Loading the arena...' : p < 0.93 ? 'Getting things colourful...' : 'Almost ready...';
    if (this.dom.label.textContent !== label) this.dom.label.textContent = label;
    const ready = this.tracker.ready;

    if (this.fallback || !this.hero) { this.updateFallback(dt, ready); return; }

    const heroReady = !!this.hero.userData.character.animator;
    if (this.phase === 'wait') {
      this.waitTime = (this.waitTime || 0) + dt;
      if (heroReady) { this.phase = 'stage'; this.hero.visible = true; this.root.classList.remove('boot'); this.root.classList.add('stage'); }
      else if (this.waitTime > 7) { this.phase = 'art'; this.beginArt(true); }
      return;
    }

    // If the game is already ready, finish the cinematic promptly.
    this.rush = ready && this.phase !== 'art' && this.phase !== 'finish';
    const speed = this.rush ? 2.6 : 1;
    const sdt = dt * speed;

    if (this.phase === 'stage' || this.phase === 'impact') {
      this.t += sdt;
      this.updateStage(this.t, sdt);
      if (this.t >= T.flightEnd && this.phase === 'stage') this.impact();
      if (this.phase === 'impact' && this.t >= T.artAt) this.beginArt(false);
    }
    this.paint.update(sdt);
    if (this.phase === 'art' || this.phase === 'finish') this.updateArt(dt, ready);
  }

  updateFallback(dt, ready) {
    this.fallbackT = (this.fallbackT || 0) + dt;
    if (this.phase !== 'finish' && ready && this.fallbackT > 1.2) { this.phase = 'finish'; this.finishT = 0; this.root.classList.add('art'); this.root.classList.remove('boot', 'stage'); }
    if (this.phase === 'finish') this.updateFinish(dt);
  }

  // ---------------------------------------------------------------- the character
  bone(name) { return this.hero.userData.character.operator.bones.get(name); }

  worldFromLocal(x, y, z, out) { return this.hero.localToWorld(out.set(x, y, z)); }

  updateStage(t, dt) {
    const camera = this.camera;
    const hero = this.hero;
    const character = hero.userData.character;
    const camBase = new THREE.Vector3(0, 1.42, this.baseCamZ);
    const lookBase = new THREE.Vector3(0, 1.1, 0.7);

    // 1) Walk in, slow down, turn and stop facing the viewer.
    const u = clamp(t / T.walkEnd, 0, 1);
    const e = easeOut(u);
    const a = new THREE.Vector3(-6.2, 0, -3.8);
    const b = new THREE.Vector3(-1.8, 0, -0.4);
    const c = new THREE.Vector3(0.15, 0, 1.4);
    this.heroPos.set(
      (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * b.x + e * e * c.x, 0,
      (1 - e) * (1 - e) * a.z + 2 * (1 - e) * e * b.z + e * e * c.z
    );
    const tangent = new THREE.Vector3(
      2 * (1 - e) * (b.x - a.x) + 2 * e * (c.x - b.x), 0, 2 * (1 - e) * (b.z - a.z) + 2 * e * (c.z - b.z)
    );
    const faceCamera = Math.atan2(-(camera.position.x - this.heroPos.x), -(camera.position.z - this.heroPos.z));
    let yaw = tangent.lengthSq() > 1e-4 ? Math.atan2(-tangent.x, -tangent.z) : faceCamera;
    const turn = smooth(1.5, 2.15, t);
    yaw = yaw + Math.atan2(Math.sin(faceCamera - yaw), Math.cos(faceCamera - yaw)) * turn;
    this.heroYaw = yaw;

    // Step forward and shift weight during the throw (group only, so the walk cycle does not retrigger).
    const stepForward = easeInOut(smooth(T.swing, T.release + 0.05, t)) * 0.32 - easeInOut(smooth(T.windup, T.swing, t)) * 0.1;
    const dir = new THREE.Vector3(Math.sin(this.heroYaw) * -1, 0, -Math.cos(this.heroYaw));
    this.heroState.position.copy(this.heroPos);
    hero.position.copy(this.heroPos).addScaledVector(dir, stepForward);
    hero.rotation.y = this.heroYaw;

    // Footsteps while walking
    if (t < T.walkEnd - 0.2) {
      this.stepClock += dt;
      const interval = 0.38 + u * 0.25;
      if (this.stepClock > interval) { this.stepClock = 0; this.audio.step(this.stepIndex++); if (this.stepIndex % 3 === 0) this.audio.cloth(); }
    }

    character.animator.update(dt, this.heroState, null, { weaponBlend: 0, shotTimer: 0, shooting: 0, isPlayer: false, drink: 0 }, 0);
    hero.updateMatrixWorld(true);

    this.poseHero(t, dt);

    // Camera: gentle push-in, then track the flying bomb.
    const flightK = smooth(T.release, T.flightEnd, t);
    const push = easeInOut(smooth(0.4, T.activate, t)) * 0.5;
    camera.position.copy(camBase);
    camera.position.z -= push + flightK * 1.15;
    camera.position.y += Math.sin(t * 0.9) * 0.02;
    const look = lookBase.clone();
    if (this.bombFlying) look.lerp(this.bomb.position, easeIn(flightK) * 0.85);
    camera.lookAt(look);
    camera.fov = this.baseFov - flightK * 7;
    camera.updateProjectionMatrix();
    if (this.shake > 0) { camera.position.x += (Math.random() - 0.5) * this.shake; camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= 0.9; }

    this.updateBomb(t, dt);
  }

  poseHero(t, dt) {
    const hero = this.hero;
    const bones = hero.userData.character.operator.bones;
    const tmp = new THREE.Vector3();
    const pole = new THREE.Vector3();
    const spines = ['spine_01', 'spine_02', 'spine_03'].map((n) => bones.get(n));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hero.getWorldQuaternion(new THREE.Quaternion()));
    const lean = (amount) => spines.forEach((s, i) => rotateBoneWorld(s, right, amount * [0.3, 0.4, 0.3][i]));
    const twist = (amount) => spines.forEach((s, i) => rotateBoneWorld(s, UP, amount * [0.3, 0.4, 0.3][i]));

    // Head turns to look straight at the viewer, with a cheeky tilt and a little head bob.
    const look = smooth(1.15, 1.9, t) * (1 - smooth(T.lookAgain - 0.12, T.lookAgain - 0.02, t) * (t < T.lookAgain ? 1 : 0)) + smooth(T.lookAgain, T.lookAgain + 0.25, t);
    const lookW = clamp(look, 0, 1);
    this.heroLook += (lookW - this.heroLook) * Math.min(1, dt * 8);
    const head = bones.get('Head');
    const neck = bones.get('neck_01');
    if (this.heroLook > 0.01) {
      const headPos = head.getWorldPosition(tmp);
      const toCam = this.camera.position.clone().sub(headPos);
      const wantYaw = Math.atan2(-toCam.x, -toCam.z);
      const delta = clamp(Math.atan2(Math.sin(wantYaw - this.heroYaw), Math.cos(wantYaw - this.heroYaw)), -1.0, 1.0);
      rotateBoneWorld(neck, UP, delta * 0.4 * this.heroLook);
      rotateBoneWorld(head, UP, delta * 0.45 * this.heroLook);
      rotateBoneWorld(head, toCam.clone().normalize(), 0.2 * this.heroLook + Math.sin(t * 5) * 0.02);
      rotateBoneWorld(head, right, -0.08 * this.heroLook);
    }

    const upperArm = bones.get('upperarm_r');
    const lowerArm = bones.get('lowerarm_r');
    const hand = bones.get('hand_r');
    const reachW = smooth(T.reach, T.reach + 0.4, t) * (1 - smooth(T.grab + 0.2, T.grab + 0.45, t));
    const holdW = smooth(T.grab, T.grab + 0.25, t);
    const throwPhase = t >= T.windup;
    this.hand = hand;

    // Pick-up: lean toward the pedestal and reach with the right hand.
    if (t >= T.reach && t < T.windup) lean(0.5 * smooth(T.reach, T.reach + 0.35, t) * (1 - smooth(T.grab + 0.1, T.grab + 0.5, t)));

    let target = null;
    let weight = 0;
    if (!throwPhase) {
      if (t < T.grab + 0.1) {
        target = tmp.copy(this.bomb.position);
        weight = reachW + (t >= T.grab ? 1 - smooth(T.grab + 0.1, T.grab + 0.2, t) : 0);
      }
      if (t >= T.inspect) {
        // Inspect near the chest with a little wobble, press the top with the other hand.
        const k = smooth(T.inspect, T.inspect + 0.25, t);
        this.worldFromLocal(0.26, 1.22 + Math.sin(t * 7) * 0.015, -0.42, tmp);
        target = tmp; weight = k;
        twist(-0.18 * Math.sin((t - T.inspect) * 3.2));
      }
    } else {
      // Anticipation -> swing -> follow-through.
      const wind = smooth(T.windup, T.swing, t);
      const swing = easeIn(smooth(T.swing, T.release, t));
      const follow = easeOut(smooth(T.release, T.follow, t));
      const p0 = new THREE.Vector3(0.6, 1.75, 0.55);
      const p1 = new THREE.Vector3(0.12, 1.52, -1.25);
      const p2 = new THREE.Vector3(-0.5, 1.0, -0.75);
      const local = new THREE.Vector3().lerpVectors(new THREE.Vector3(0.26, 1.22, -0.42), p0, easeInOut(wind));
      local.lerp(p1, swing);
      local.lerp(p2, follow);
      this.worldFromLocal(local.x, local.y, local.z, tmp);
      target = tmp; weight = 1;
      // Torso winds back (clockwise), then whips through (counter-clockwise) and follows through.
      twist(-0.75 * easeInOut(wind) + 1.7 * swing - 0.35 * follow);
      lean(-0.25 * easeInOut(wind) + 0.55 * swing - 0.25 * follow);
    }
    if (target && weight > 0.001) {
      const polePoint = this.worldFromLocal(1.0, 0.7, 0.4, pole);
      solveTwoBone(upperArm, lowerArm, hand, target, polePoint, clamp(weight, 0, 0.98));
    }
    // Left hand taps the activation cap.
    if (t >= T.activate - 0.2 && t < T.windup) {
      const w = smooth(T.activate - 0.2, T.activate - 0.05, t) * (1 - smooth(T.activate + 0.12, T.activate + 0.3, t));
      if (w > 0.01) {
        const cap = this.bomb.localToWorld(new THREE.Vector3(0, 0.26, 0));
        solveTwoBone(bones.get('upperarm_l'), bones.get('lowerarm_l'), bones.get('hand_l'), cap, this.worldFromLocal(-0.9, 0.8, 0.3, pole), 0.95 * w);
      }
    }
    hero.updateMatrixWorld(true);
  }

  updateBomb(t, dt) {
    const bomb = this.bomb;
    const data = bomb.userData;
    const hand = this.hand;
    if (t < T.grab) {
      bomb.position.copy(this.bombRest).add(new THREE.Vector3(0, 0.17 + Math.sin(t * 3) * 0.004, 0));
      bomb.rotation.y += dt * 0.6;
    } else if (!this.bombFlying) {
      // In hand: lerp into the palm, then follow the hand.
      const palm = hand.getWorldPosition(new THREE.Vector3());
      const grip = new THREE.Vector3(0, 0.07, 0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      palm.add(grip);
      const settle = smooth(T.grab, T.grab + 0.15, t);
      bomb.position.lerp(palm, 0.15 + settle * 0.85);
      const wobble = 1 + Math.sin(t * 22) * 0.04 * (1 - smooth(T.inspect + 0.2, T.activate, t));
      bomb.scale.set(1 / wobble, wobble, 1 / wobble);
      bomb.rotation.set(Math.sin(t * 3) * 0.2, bomb.rotation.y + dt * 2, 0);
      if (t >= T.release) this.launchBomb();
    }
    // Activation: core brightens, fuse sparks.
    if (t >= T.activate) {
      this.once('activate', () => { this.audio.activate(); this.audio.fuse(); });
      const a = smooth(T.activate, T.activate + 0.2, t);
      data.coreMat.emissiveIntensity = 0.9 + a * 1.4 + Math.sin(t * 30) * 0.2;
      data.spark.scale.setScalar(a * (0.2 + Math.random() * 0.08));
    }
    if (this.bombFlying) this.flyBomb(t, dt);
  }

  once(name, fn) { if (!this.cues.has(name)) { this.cues.add(name); fn(); } }

  launchBomb() {
    this.bombFlying = true;
    this.bomb.scale.set(1, 1, 1);
    this.flightStart = this.bomb.position.clone();
    this.audio.throwWhoosh();
    setTimeout(() => this.audio.flight(), 80);
  }

  flyBomb(t, dt) {
    const k = clamp((t - T.release) / (T.flightEnd - T.release), 0, 1);
    const e = easeIn(k);
    const cam = this.camera.position;
    const end = new THREE.Vector3(cam.x + 0.02, cam.y - 0.03, cam.z - 0.9);
    const pos = new THREE.Vector3().lerpVectors(this.flightStart, end, e);
    pos.y += Math.sin(k * Math.PI) * 0.22;
    const velocity = pos.clone().sub(this.bomb.position);
    this.bomb.position.copy(pos);
    this.bomb.rotation.x += dt * 14;
    this.bomb.rotation.z += dt * 9;
    // Stretch along the direction of travel to suggest motion blur.
    const stretch = 1 + Math.min(1.1, velocity.length() / Math.max(dt, 1e-3) * 0.045);
    this.bomb.scale.set(1, 1, stretch);
    this.bomb.lookAt(this.bomb.position.clone().add(velocity.lengthSq() > 1e-8 ? velocity : new THREE.Vector3(0, 0, -1)));
    // Coloured paint trail
    this.trail.forEach((m, i) => {
      const f = Math.max(0, k - (i + 1) * 0.045);
      m.visible = k > 0.04;
      m.position.lerpVectors(this.flightStart, end, easeIn(f));
      m.position.y += Math.sin(f * Math.PI) * 0.22;
      m.scale.setScalar(0.13 * (1 - i / 8));
      m.material.opacity = 0.55 * (1 - i / 7) * Math.min(1, k * 4);
      m.material.color.setHex(i % 2 ? 0x35d6ff : 0xff7a3c);
    });
  }

  impact() {
    this.phase = 'impact';
    this.bombFlying = false;
    this.bomb.visible = false;
    this.trail.forEach((m) => { m.visible = false; });
    this.shake = 0.35;
    this.audio.impact();
    this.paint.splat(0.5, 0.46);
    setTimeout(() => this.root.classList.add('paint-hit'), 0);
    this.impactClock = 0;
  }

  // ---------------------------------------------------------------- artwork phase
  beginArt(skipped) {
    this.phase = 'art';
    this.artTime = 0;
    this.root.classList.remove('boot', 'stage');
    this.root.classList.add('art');
    this.hero && (this.hero.visible = false);
    this.impactT = 0;
    if (!skipped) this.paint.startRecede();
    this.once('logo-cue', () => setTimeout(() => this.audio.logo(), 650));
    setTimeout(() => this.paint?.seedDrips(), 900);
  }

  updateArt(dt, ready) {
    this.artTime += dt;
    const u = this.artMaterial.uniforms;
    u.uTime.value += dt;
    // Intensity varies: strong waves followed by calmer periods, never constant shaking.
    const wave = 0.55 + 0.45 * Math.sin(this.artTime * 0.7) * Math.sin(this.artTime * 0.23 + 1.3);
    u.uIntensity.value = this.phase === 'finish' ? u.uIntensity.value : clamp(0.55 + wave * 0.6, 0.3, 1.1);
    this.impactT += dt;
    u.uImpactT.value = this.impactT;
    if (this.impactT > 4.5 + Math.random() * 3) { this.impactT = 0; this.audio.glitch(); }
    if (Math.random() < dt * 1.4) this.audio.glitch();
    this.renderArt = true;
    if (this.phase === 'art' && ready && this.artTime > 2.0) { this.phase = 'finish'; this.finishT = 0; }
    if (this.phase === 'finish') this.updateFinish(dt);
  }

  updateFinish(dt) {
    this.finishT += dt;
    const k = clamp(this.finishT / 1.7, 0, 1);
    if (this.artMaterial) this.artMaterial.uniforms.uCalm.value = easeInOut(k);
    this.paint?.setSettle(k);
    this.root.style.setProperty('--finish', String(k));
    if (this.finishT > 1.0 && !this.dropped) {
      this.dropped = true;
      this.dom.drop.classList.add('fall');
      setTimeout(() => this.audio.bounce(), 380);
    }
    if (this.finishT > 2.0 && !this.fading) {
      this.fading = true;
      this.root.classList.add('leaving');
      setTimeout(() => this.dispose(), 650);
    }
  }

  skip() {
    if (this.phase === 'stage') { this.t = Math.max(this.t, T.release - 0.1); }
    else if (this.phase === 'wait') { this.waitTime = 99; }
  }

  // ---------------------------------------------------------------- render + teardown
  render() {
    if (!this.renderer) return;
    if (this.renderArt) this.renderer.render(this.artScene, this.artCamera);
    else if (this.phase === 'stage' || this.phase === 'impact') this.renderer.render(this.scene, this.camera);
    else this.renderer.clear();
    this.paint?.render();
  }

  fail() { this.tracker.force(); this.dispose(); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    removeEventListener('pointerdown', this.onGesture);
    removeEventListener('keydown', this.onGesture);
    this.paint?.dispose();
    for (const object of this.disposables || []) { try { object.dispose?.(); } catch { /* already gone */ } }
    this.hero?.traverse((n) => { if (n.isMesh) { n.geometry = n.geometry; } });
    this.scene?.clear();
    this.artScene?.clear();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    document.body.classList.remove('splash-on');
    this.root.remove();
    window.dispatchEvent(new Event('tint3d:splash-done'));
  }
}

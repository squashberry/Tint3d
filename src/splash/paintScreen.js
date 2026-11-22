// Thick, glossy, rubbery paint thrown at the screen. A low-resolution metaball field is shaded
// per pixel (normal from the density gradient -> diffuse + specular), then scaled up by the browser.
// Blobs squash and wobble, strands stretch and snap, droplets bounce and stick, drips run down.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c1 = 1.9; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rand = (a, b) => a + Math.random() * (b - a);

export const PAINT_PALETTE = [
  [255, 64, 150], [255, 206, 44], [255, 116, 58], [34, 150, 255], [34, 218, 236], [140, 96, 255]
];

export class PaintScreen {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reset();
    this.resize(1);
  }

  reset() {
    this.blobs = [];
    this.droplets = [];
    this.strands = [];
    this.drips = [];
    this.time = 0;
    this.recede = -1;
    this.settleK = 0;
    this.impact = { x: 0, y: 0 };
    this.active = false;
    this.onBounce = null;
    this.onDrip = null;
    this.onWobble = null;
  }

  resize(scale = 1) {
    const w = clamp(Math.round(innerWidth / 4.4 * scale), 220, 420);
    const h = Math.max(120, Math.round(w * innerHeight / Math.max(1, innerWidth)));
    this.W = w;
    this.H = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const n = w * h;
    this.D = new Float32Array(n);
    this.WS = new Float32Array(n);
    this.CR = new Float32Array(n);
    this.CG = new Float32Array(n);
    this.CB = new Float32Array(n);
    this.image = this.ctx.createImageData(w, h);
  }

  /** Fire the splat at a normalised screen position. */
  splat(nx = 0.5, ny = 0.46) {
    const { W, H } = this;
    const callbacks = { onBounce: this.onBounce, onDrip: this.onDrip, onWobble: this.onWobble };
    this.reset();
    Object.assign(this, callbacks);
    this.active = true;
    this.impact = { x: nx * W, y: ny * H };
    const diag = Math.hypot(W, H);
    for (let i = 0; i < 52; i++) {
      const layer = Math.floor(i / 10.5);
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 0.7) * diag * 0.78;
      this.blobs.push({
        x: this.impact.x, y: this.impact.y,
        tx: this.impact.x + Math.cos(angle) * dist * 1.05, ty: this.impact.y + Math.sin(angle) * dist * 0.85,
        r: H * rand(0.17, 0.36), delay: layer * 0.045 + dist / diag * 0.22, age: 0, wob: rand(0, 6.28),
        color: PAINT_PALETTE[[1, 2, 0, 3, 4, 5][layer % 6]], w: 1 + layer * 2.6, keep: false, rr: 0
      });
    }
    this.blobs.push({ x: this.impact.x, y: this.impact.y, tx: this.impact.x, ty: this.impact.y, r: H * 0.62, delay: 0.02, age: 0, wob: 0, color: PAINT_PALETTE[3], w: 9, keep: false, rr: 0 });
    for (let i = 0; i < 34; i++) {
      const side = i % 4;
      const u = rand(0.02, 0.98);
      const x = side === 0 ? u * W : side === 1 ? W * rand(0.94, 1.03) : side === 2 ? u * W : W * rand(-0.03, 0.06);
      const y = side === 0 ? H * rand(-0.03, 0.07) : side === 1 ? u * H : side === 2 ? H * rand(0.93, 1.03) : u * H;
      this.blobs.push({
        x: this.impact.x, y: this.impact.y, tx: x, ty: y, r: H * rand(0.06, 0.13), delay: 0.12 + Math.random() * 0.18, age: 0,
        wob: rand(0, 6.28), color: PAINT_PALETTE[Math.floor(rand(0, 6))], w: 14, keep: true, rr: 0, side
      });
    }
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = H * rand(0.9, 3.2);
      this.droplets.push({
        x: this.impact.x, y: this.impact.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - H * 0.5,
        r: H * rand(0.012, 0.036), color: PAINT_PALETTE[Math.floor(rand(0, 6))], bounces: 0, w: 16
      });
    }
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
      const speed = H * rand(1.1, 2.0);
      this.strands.push({
        ox: this.impact.x, oy: this.impact.y, x: this.impact.x, y: this.impact.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: H * rand(0.03, 0.05), color: PAINT_PALETTE[Math.floor(rand(0, 6))], broken: false, breakAt: H * rand(0.35, 0.7), w: 18
      });
    }
  }

  startRecede() { if (this.recede < 0) this.recede = 0; }

  seedDrips() {
    const { H } = this;
    const heads = this.blobs.filter((b) => b.keep && b.rr > 2);
    for (let i = 0; i < 9 && heads.length; i++) {
      const b = heads[Math.floor(Math.random() * heads.length)];
      this.drips.push({
        x: b.x + rand(-b.rr * 0.5, b.rr * 0.5), y: b.y + b.rr * 0.4, v: rand(2, 8), vmax: rand(10, 30) * (H / 180), r: rand(1.4, 3.2) * (H / 180),
        color: b.color, trail: [], drop: Math.random() < 0.4, dropped: false, born: this.time, w: 20, last: 0
      });
    }
  }

  setSettle(k) { this.settleK = clamp(k, 0, 1); }

  update(dt) {
    if (!this.active) return;
    const { W, H } = this;
    const diag = Math.hypot(W, H);
    this.time += dt;
    if (this.recede >= 0) this.recede += dt;
    const calm = 1 - this.settleK * 0.85;

    for (const b of this.blobs) {
      b.age += dt;
      if (b.age < b.delay) { b.rr = 0; continue; }
      const u = clamp((b.age - b.delay) / 0.36, 0, 1);
      const e = easeOutBack(u);
      b.x = this.impact.x + (b.tx - this.impact.x) * e;
      b.y = this.impact.y + (b.ty - this.impact.y) * e;
      const since = b.age - b.delay;
      let rr = b.r * clamp(e, 0, 1.15) * (1 + 0.14 * Math.sin(since * 13 + b.wob) * Math.exp(-since * 2.1) + 0.015 * Math.sin(this.time * 2 + b.wob) * calm);
      if (!b.keep && this.recede >= 0) {
        const dist = Math.hypot(b.tx - this.impact.x, b.ty - this.impact.y) / diag;
        rr *= 1 - smooth(0, 0.6, this.recede * 1.15 - dist * 0.55);
      }
      if (b.keep && this.settleK > 0.6) {
        b.slide = (b.slide || 0) + dt * (10 + this.settleK * 160);
        b.y += b.slide;
        rr *= 1 - smooth(0.7, 1, this.settleK) * 0.6;
      }
      b.rr = Math.max(0, rr);
    }
    if (this.recede > 2) this.blobs = this.blobs.filter((b) => b.keep || b.rr > 0.5);

    for (const d of this.droplets) {
      if (d.stuck) continue;
      d.vy += H * 5.2 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-0.6 * dt);
      if (d.y > H - d.r) {
        d.y = H - d.r;
        d.vy *= -0.42;
        d.vx *= 0.7;
        d.bounces++;
        if (d.bounces === 1) this.onBounce?.();
        if (d.bounces > 2) d.stuck = true;
      }
      if (d.x < d.r || d.x > W - d.r) { d.vx *= -0.5; d.x = clamp(d.x, d.r, W - d.r); }
      if (Math.abs(d.vx) < H * 0.05 && Math.abs(d.vy) < H * 0.05 && d.y > H * 0.5) d.stuck = true;
    }

    for (const s of this.strands) {
      if (s.broken) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += H * 1.6 * dt;
      s.vx *= Math.exp(-1.2 * dt);
      s.vy *= Math.exp(-0.8 * dt);
      if (Math.hypot(s.x - s.ox, s.y - s.oy) > s.breakAt) {
        s.broken = true;
        for (let i = 1; i <= 4; i++) {
          const f = i / 5;
          this.droplets.push({
            x: s.ox + (s.x - s.ox) * f, y: s.oy + (s.y - s.oy) * f, vx: s.vx * rand(0.2, 0.7), vy: s.vy * rand(0.1, 0.6),
            r: s.r * (0.5 - f * 0.25), color: s.color, bounces: 0, w: 16
          });
        }
        this.onWobble?.();
      }
    }
    this.strands = this.strands.filter((s) => !s.broken);

    for (const d of this.drips) {
      d.v = Math.min(d.vmax, d.v + (H * 0.5 + 6) * dt * 0.18);
      d.y += d.v * dt * calm;
      if (d.y - d.last > 2.2) { d.trail.push({ x: d.x, y: d.y }); d.last = d.y; if (d.trail.length > 46) d.trail.shift(); }
      d.r = Math.max(0.9, d.r - dt * 0.02);
      if (d.drop && !d.dropped && d.y > H * 0.55 && this.time - d.born > 1.2) {
        d.dropped = true;
        this.droplets.push({ x: d.x, y: d.y, vx: 0, vy: H * 0.4, r: d.r * 1.6, color: d.color, bounces: 0, w: 20 });
        this.onDrip?.();
        d.v *= 0.3;
      }
    }
    this.drips = this.drips.filter((d) => d.y < H + 20);
  }

  field(cx, cy, r, color, w) {
    const { W, H } = this;
    if (r < 0.6) return;
    const R = r * 2.1;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(H - 1, Math.ceil(cy + R));
    const inv = 1 / (R * R);
    const { D, WS, CR, CG, CB } = this;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const q = 1 - (dx * dx + dy * dy) * inv;
        if (q <= 0) continue;
        const dens = q * q * 1.25;
        const i = y * W + x;
        const cw = dens * w;
        D[i] += dens;
        WS[i] += cw;
        CR[i] += cw * color[0];
        CG[i] += cw * color[1];
        CB[i] += cw * color[2];
      }
    }
  }

  render() {
    if (!this.active || !this.D) { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); return; }
    const { W, H, D, WS, CR, CG, CB, image } = this;
    D.fill(0); WS.fill(0); CR.fill(0); CG.fill(0); CB.fill(0);
    for (const b of this.blobs) if (b.rr > 0.6) this.field(b.x, b.y, b.rr, b.color, b.w);
    for (const d of this.droplets) this.field(d.x, d.y, d.r * (1 + 0.1 * Math.sin(this.time * 18 + d.x)), d.color, d.w);
    for (const s of this.strands) {
      const len = Math.hypot(s.x - s.ox, s.y - s.oy);
      const n = Math.max(2, Math.floor(len / 3));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const thin = 0.35 + 0.65 * Math.abs(f * 2 - 1);
        this.field(s.ox + (s.x - s.ox) * f, s.oy + (s.y - s.oy) * f, s.r * thin * (1 - Math.min(0.7, len / (s.breakAt * 1.6))), s.color, s.w);
      }
    }
    for (const d of this.drips) {
      for (let i = 0; i < d.trail.length; i++) this.field(d.trail[i].x, d.trail[i].y, d.r * (0.5 + 0.5 * i / d.trail.length), d.color, d.w);
      this.field(d.x, d.y, d.r * 1.35, d.color, d.w);
    }
    const data = image.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const total = D[i];
        const o = i * 4;
        if (total < 0.5) { data[o + 3] = 0; continue; }
        const ws = WS[i] || 1;
        let cr = CR[i] / ws;
        let cg = CG[i] / ws;
        let cb = CB[i] / ws;
        const l = x > 0 ? D[i - 1] : total;
        const r = x < W - 1 ? D[i + 1] : total;
        const u = y > 0 ? D[i - W] : total;
        const d = y < H - 1 ? D[i + W] : total;
        const gx = (r - l) * 0.5;
        const gy = (d - u) * 0.5;
        const thick = smooth(0.5, 1.8, total);
        const light = -(gx * 0.6 + gy * 0.8);
        const diffuse = 1 + clamp(light * 2.0, -0.45, 0.45);
        const spec = Math.pow(Math.max(0, light * 5.2 - 0.3), 2) * 170;
        const rim = 1 - smooth(0.5, 0.82, total);
        const shade = (0.66 + 0.34 * thick) * diffuse;
        cr = cr * shade + spec - rim * 46;
        cg = cg * shade + spec - rim * 46;
        cb = cb * shade + spec - rim * 46;
        data[o] = cr < 0 ? 0 : cr > 255 ? 255 : cr;
        data[o + 1] = cg < 0 ? 0 : cg > 255 ? 255 : cg;
        data[o + 2] = cb < 0 ? 0 : cb > 255 ? 255 : cb;
        data[o + 3] = 255 * smooth(0.5, 0.62, total);
      }
    }
    this.ctx.putImageData(image, 0, 0);
  }

  dispose() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.reset();
    this.ctx.clearRect(0, 0, w, h);
    this.D = this.WS = this.CR = this.CG = this.CB = null;
    this.image = null;
  }
}

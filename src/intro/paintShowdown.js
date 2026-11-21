// Low-resolution metaball renderer for the "paint collision": two teams' paint rushes
// together, merges into thick glossy blobs, splashes, and floods the screen.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeInCubic = (t) => t * t * t;
const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export class PaintShowdown {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize(1);
  }

  resize(scale) {
    const aspect = Math.max(0.4, Math.min(1.2, innerHeight / Math.max(1, innerWidth)));
    this.W = Math.round(300 * scale);
    this.H = Math.round(this.W * aspect);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.fieldA = new Float32Array(this.W * this.H);
    this.fieldB = new Float32Array(this.W * this.H);
    this.image = this.ctx.createImageData(this.W, this.H);
  }

  start(colorA, colorB) {
    this.colorA = hexToRgb(colorA);
    this.colorB = hexToRgb(colorB);
    this.time = 0;
    this.impacted = false;
    this.droplets = [];
    this.blobs = [];
    const { W, H } = this;
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < 16; i++) {
        const row = (i + 0.5) / 16;
        this.blobs.push({
          team,
          startX: team === 0 ? -W * (0.25 + Math.random() * 0.45) : W * (1.25 + Math.random() * 0.45),
          y: H * (0.1 + row * 0.8) + (Math.random() - 0.5) * H * 0.08,
          r: H * (0.1 + Math.random() * 0.1),
          depth: Math.random(),
          phase: Math.random() * 6.28
        });
      }
    }
  }

  /** k in 0..1 across the whole showdown. Returns true on the frame the two walls hit. */
  update(dt, k) {
    this.time += dt;
    const { W, H } = this;
    let hit = false;
    const approach = easeInCubic(Math.min(1, k / 0.42));
    for (const b of this.blobs) {
      const target = W * (0.5 + (b.team === 0 ? -0.07 : 0.07) * (0.4 + b.depth));
      const squash = this.impacted ? 1 + Math.sin(Math.min(1, (k - 0.42) / 0.5) * Math.PI) * 0.25 : 1;
      b.x = b.startX + (target - b.startX) * approach;
      b.rr = b.r * (1 + 0.07 * Math.sin(this.time * 11 + b.phase)) * squash;
      if (this.impacted) {
        const flood = smooth(0.62, 1, k);
        b.rr *= 1 + flood * 3.6;
        b.x += (b.team === 0 ? -1 : 1) * flood * W * 0.12 * b.depth;
      }
    }
    if (!this.impacted && k >= 0.42) {
      this.impacted = true;
      hit = true;
      for (let i = 0; i < 70; i++) {
        const team = i % 2;
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const speed = H * (0.5 + Math.random() * 1.6);
        this.droplets.push({
          team, x: W * 0.5 + (Math.random() - 0.5) * W * 0.06, y: H * (0.2 + Math.random() * 0.6),
          vx: Math.cos(angle) * speed * (team === 0 ? -1 : 1) * (0.4 + Math.random()), vy: Math.sin(angle) * speed,
          r: H * (0.012 + Math.random() * 0.03), life: 0.7 + Math.random() * 0.7
        });
      }
    }
    for (const d of this.droplets) {
      d.life -= dt;
      d.vy += H * 2.4 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.droplets = this.droplets.filter((d) => d.life > 0 && d.y < H * 1.2);
    return hit;
  }

  addMetaball(field, cx, cy, r) {
    const { W, H } = this;
    const R = r * 2.1;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(H - 1, Math.ceil(cy + R));
    const inv = 1 / (R * R);
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const q = 1 - (dx * dx + dy * dy) * inv;
        if (q > 0) field[y * W + x] += q * q * 1.25;
      }
    }
  }

  render(alpha = 1) {
    const { W, H, fieldA, fieldB, image } = this;
    fieldA.fill(0);
    fieldB.fill(0);
    for (const b of this.blobs) this.addMetaball(b.team === 0 ? fieldA : fieldB, b.x, b.y, b.rr);
    for (const d of this.droplets) this.addMetaball(d.team === 0 ? fieldA : fieldB, d.x, d.y, d.r * (0.6 + Math.min(1, d.life)));
    const data = image.data;
    const ca = this.colorA;
    const cb = this.colorB;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const a = fieldA[i];
        const b = fieldB[i];
        const total = a + b;
        const o = i * 4;
        if (total < 0.5) { data[o + 3] = 0; continue; }
        // Surface normal from the density gradient gives the glossy, rubbery look.
        const l = x > 0 ? fieldA[i - 1] + fieldB[i - 1] : total;
        const r = x < W - 1 ? fieldA[i + 1] + fieldB[i + 1] : total;
        const u = y > 0 ? fieldA[i - W] + fieldB[i - W] : total;
        const d = y < H - 1 ? fieldA[i + W] + fieldB[i + W] : total;
        const gx = (r - l) * 0.5;
        const gy = (d - u) * 0.5;
        const mixB = b / total;
        let cr = ca[0] + (cb[0] - ca[0]) * mixB;
        let cg = ca[1] + (cb[1] - ca[1]) * mixB;
        let cbl = ca[2] + (cb[2] - ca[2]) * mixB;
        const thick = smooth(0.5, 1.6, total);
        const shade = 0.62 + 0.38 * thick;
        const light = -(gx * 0.55 + gy * 0.85);
        const diffuse = 1 + Math.max(-0.5, Math.min(0.5, light * 2.2));
        const spec = Math.pow(Math.max(0, light * 5 - 0.35), 2) * 160;
        const rim = 1 - smooth(0.5, 0.78, total);
        cr = cr * shade * diffuse + spec - rim * 40;
        cg = cg * shade * diffuse + spec - rim * 40;
        cbl = cbl * shade * diffuse + spec - rim * 40;
        data[o] = cr < 0 ? 0 : cr > 255 ? 255 : cr;
        data[o + 1] = cg < 0 ? 0 : cg > 255 ? 255 : cg;
        data[o + 2] = cbl < 0 ? 0 : cbl > 255 ? 255 : cbl;
        data[o + 3] = 255 * smooth(0.5, 0.6, total) * alpha;
      }
    }
    this.ctx.putImageData(image, 0, 0);
  }
}

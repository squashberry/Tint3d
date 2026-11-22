// Original Tint3d loading illustration, painted procedurally onto a canvas (no stock images, no
// third-party artwork). A paint-war arena at dusk: halftone sun, harbour skyline, container stacks,
// towers, and two teams' paint arcs colliding above a floor of glossy puddles.
const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function blob(g, x, y, r, rng, wobble = 0.28, points = 22) {
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 + (rng() - 0.5) * wobble * 2);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.82;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

function splat(g, x, y, r, color, hi, rng) {
  g.save();
  g.fillStyle = color;
  blob(g, x, y, r, rng, 0.32);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (1.15 + rng() * 0.9);
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.05 + rng() * 0.12), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = hi;
  g.globalAlpha = 0.55;
  blob(g, x - r * 0.25, y - r * 0.28, r * 0.35, rng, 0.2, 12);
  g.fill();
  g.restore();
}

function halftone(g, x, y, w, h, step, color, alphaFn) {
  g.save();
  g.fillStyle = color;
  for (let j = 0; j * step < h; j++) {
    for (let i = 0; i * step < w; i++) {
      const px = x + i * step + (j % 2 ? step / 2 : 0);
      const py = y + j * step;
      const a = alphaFn(px, py);
      if (a <= 0.02) continue;
      g.beginPath();
      g.arc(px, py, step * 0.5 * a, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function container(g, x, y, w, h, color, dark, rng) {
  g.fillStyle = dark;
  g.fillRect(x + w * 0.04, y + h * 0.04, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, y, w, h * 0.12);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 1; i < 9; i++) g.fillRect(x + (w * i) / 9, y + h * 0.14, w * 0.018, h * 0.8);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = Math.max(2, w * 0.012);
  g.strokeRect(x, y, w, h);
  // drips
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const dx = x + rng() * w;
    const dl = h * (0.2 + rng() * 0.5);
    g.fillRect(dx, y + h, w * 0.018, dl);
    g.beginPath();
    g.arc(dx + w * 0.009, y + h + dl, w * 0.016, 0, Math.PI * 2);
    g.fill();
  }
}

export function paintArtwork(width, height) {
  const W = width;
  const H = height;
  const rng = mulberry(20260722);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const horizon = H * 0.58;

  // Sky
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  [[0, '#140f40'], [0.34, '#4d2a95'], [0.62, '#e8467f'], [0.86, '#ff9a4a'], [1, '#ffe2a0']].forEach(([s, c]) => sky.addColorStop(s, c));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon + 2);

  // Halftone sun and rays
  const sx = W * 0.5;
  const sy = horizon - H * 0.07;
  const sr = H * 0.25;
  const sun = g.createRadialGradient(sx, sy, sr * 0.1, sx, sy, sr);
  sun.addColorStop(0, '#fffbe0'); sun.addColorStop(0.7, '#ffd36a'); sun.addColorStop(1, '#ff8d4a');
  g.fillStyle = sun;
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.clip();
  halftone(g, sx - sr, sy - sr, sr * 2, sr * 2, H * 0.022, 'rgba(210,60,120,0.55)', (px, py) => Math.max(0, (py - (sy - sr)) / (sr * 2) - 0.25));
  g.restore();
  g.save();
  g.globalAlpha = 0.12;
  g.fillStyle = '#fff3c4';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a - 0.04) * W, sy + Math.sin(a - 0.04) * W);
    g.lineTo(sx + Math.cos(a + 0.04) * W, sy + Math.sin(a + 0.04) * W);
    g.closePath();
    g.fill();
  }
  g.restore();

  // Harbour skyline (silhouettes) with cranes
  g.fillStyle = '#2b1d5e';
  let x = -10;
  while (x < W) {
    const bw = W * (0.03 + rng() * 0.05);
    const bh = H * (0.05 + rng() * 0.16);
    g.fillRect(x, horizon - bh, bw, bh + 2);
    x += bw * (0.7 + rng() * 0.5);
  }
  g.strokeStyle = '#231650';
  g.lineWidth = Math.max(2, W * 0.003);
  for (const cx of [W * 0.16, W * 0.82]) {
    g.beginPath(); g.moveTo(cx, horizon); g.lineTo(cx, horizon - H * 0.3); g.lineTo(cx + W * 0.1, horizon - H * 0.3); g.moveTo(cx - W * 0.04, horizon - H * 0.3); g.lineTo(cx + W * 0.1, horizon - H * 0.3); g.stroke();
    g.beginPath(); g.moveTo(cx + W * 0.08, horizon - H * 0.3); g.lineTo(cx + W * 0.08, horizon - H * 0.2); g.stroke();
  }

  // Sea band with sun reflection
  const sea = g.createLinearGradient(0, horizon, 0, horizon + H * 0.06);
  sea.addColorStop(0, '#ff9a4a'); sea.addColorStop(1, '#3a2478');
  g.fillStyle = sea;
  g.fillRect(0, horizon, W, H * 0.06);
  g.fillStyle = 'rgba(255,236,170,0.5)';
  for (let i = 0; i < 14; i++) g.fillRect(sx - W * 0.1 * (1 - i / 14) - 5, horizon + (i / 14) * H * 0.06, W * 0.2 * (1 - i / 14) + 10, 2);

  // Arena floor with perspective grid
  const floorTop = horizon + H * 0.06;
  const floor = g.createLinearGradient(0, floorTop, 0, H);
  floor.addColorStop(0, '#1d5a78'); floor.addColorStop(1, '#0a1f33');
  g.fillStyle = floor;
  g.fillRect(0, floorTop, W, H - floorTop);
  g.strokeStyle = 'rgba(160,230,255,0.16)';
  g.lineWidth = 1.5;
  for (let i = -14; i <= 14; i++) { g.beginPath(); g.moveTo(sx + i * W * 0.012, floorTop); g.lineTo(sx + i * W * 0.14, H); g.stroke(); }
  for (let j = 1; j < 9; j++) { const y = floorTop + (H - floorTop) * Math.pow(j / 9, 1.8); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  // Glossy puddles
  splat(g, W * 0.27, H * 0.84, H * 0.2, '#1f8fff', 'rgba(255,255,255,0.9)', rng);
  splat(g, W * 0.73, H * 0.8, H * 0.19, '#ff6a3c', 'rgba(255,255,255,0.9)', rng);
  splat(g, W * 0.5, H * 0.9, H * 0.12, '#ff3f95', 'rgba(255,255,255,0.8)', rng);
  splat(g, W * 0.4, H * 0.72, H * 0.07, '#ffd02e', 'rgba(255,255,255,0.8)', rng);
  splat(g, W * 0.62, H * 0.7, H * 0.06, '#22dcec', 'rgba(255,255,255,0.8)', rng);

  // Container stacks (left blue side, right orange side)
  const cw = W * 0.15;
  const ch = H * 0.12;
  const stacks = [
    [W * 0.03, floorTop - ch * 0.4, '#2a74d6', '#12306b'], [W * 0.03 + cw * 1.02, floorTop - ch * 0.4, '#23b4cf', '#0f4d66'], [W * 0.05, floorTop - ch * 1.45, '#ff4d98', '#6b1a45'],
    [W * 0.82, floorTop - ch * 0.4, '#ff7a3c', '#6e2a14'], [W * 0.67, floorTop - ch * 0.4, '#ffbf2e', '#6b4d0f'], [W * 0.8, floorTop - ch * 1.45, '#2a74d6', '#12306b']
  ];
  for (const [bx, by, c, d] of stacks) container(g, bx, by, cw, ch, c, d, rng);

  // Tower platform with ramp, centre background
  g.fillStyle = '#31407a';
  g.beginPath(); g.moveTo(W * 0.43, floorTop); g.lineTo(W * 0.57, floorTop); g.lineTo(W * 0.545, floorTop - H * 0.13); g.lineTo(W * 0.455, floorTop - H * 0.13); g.closePath(); g.fill();
  g.fillStyle = '#4b5fb0';
  g.fillRect(W * 0.445, floorTop - H * 0.15, W * 0.11, H * 0.025);
  g.fillStyle = '#22dcec';
  g.fillRect(W * 0.445, floorTop - H * 0.128, W * 0.11, H * 0.008);

  // Two paint arcs colliding above the arena
  const arc = (x0, y0, x1, y1, cx1, cy1, color, glossy) => {
    g.save();
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = k === 0 ? color : k === 1 ? glossy : color;
      g.globalAlpha = k === 1 ? 0.5 : 1;
      g.lineWidth = H * (k === 0 ? 0.075 : k === 1 ? 0.02 : 0.045);
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx1, cy1, x1, y1); g.stroke();
    }
    g.restore();
  };
  arc(-W * 0.02, H * 0.46, W * 0.5, H * 0.3, W * 0.2, H * 0.08, '#1f8fff', '#bfe3ff');
  arc(W * 1.02, H * 0.46, W * 0.5, H * 0.3, W * 0.8, H * 0.08, '#ff6a3c', '#ffd9c2');
  splat(g, W * 0.5, H * 0.3, H * 0.1, '#ff3f95', 'rgba(255,255,255,0.9)', rng);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const d = H * (0.1 + rng() * 0.2);
    g.fillStyle = ['#ffd02e', '#22dcec', '#ff3f95', '#1f8fff', '#ff6a3c'][i % 5];
    g.beginPath(); g.arc(W * 0.5 + Math.cos(a) * d * 1.5, H * 0.3 + Math.sin(a) * d * 0.7, H * (0.006 + rng() * 0.014), 0, Math.PI * 2); g.fill();
  }

  // Foreground corner splats
  splat(g, W * 0.02, H * 0.98, H * 0.18, '#ff3f95', 'rgba(255,255,255,0.8)', rng);
  splat(g, W * 0.98, H * 0.98, H * 0.18, '#22dcec', 'rgba(255,255,255,0.8)', rng);

  // Halftone shading, vignette, grain
  halftone(g, 0, 0, W, H, H * 0.018, 'rgba(10,6,40,0.5)', (px, py) => Math.max(0, Math.pow(Math.hypot(px / W - 0.5, py / H - 0.5) * 1.5, 2.4) - 0.2));
  const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(4,2,20,0.55)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 1800; i++) { g.fillStyle = rng() > 0.5 ? '#fff' : '#000'; g.fillRect(rng() * W, rng() * H, 1.5, 1.5); }
  g.globalAlpha = 1;
  return canvas;
}

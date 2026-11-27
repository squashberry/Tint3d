// Top-down map renderer (canvas). Works in the browser; returns an HTMLCanvasElement.

import { hexToLinear, clamp, smoothstep } from './noise.js';
import * as C from './config.js';

const { HALF, N, NV, CELL, WORLD } = C;

const toSrgb = (c) => {
  const f = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  return [f(c[0]), f(c[1]), f(c[2])];
};
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BIOME_RGB = [rgb(0x86d65a), rgb(0x3f9a4a), rgb(0xf0f6fb), rgb(0xeccb83), rgb(0x4d4752)];

export function renderMinimap(T, extra = {}, size = 1024) {
  const { localRoads = [], landmarks = T.pois, labels = true, houses = [] } = extra;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const H = T.heights;
  const px2w = WORLD / size;
  const lakeBox = { x0: C.LAKE.x - 340, x1: C.LAKE.x + 340, z0: C.LAKE.z - 340, z1: C.LAKE.z + 340 };
  for (let py = 0; py < size; py++) {
    const z = -HALF + (py + 0.5) * px2w;
    for (let pxl = 0; pxl < size; pxl++) {
      const x = -HALF + (pxl + 0.5) * px2w;
      const ix = clamp(Math.round((x + HALF) / CELL), 1, N - 1);
      const iz = clamp(Math.round((z + HALF) / CELL), 1, N - 1);
      const i = iz * NV + ix;
      const h = H[i];
      let c;
      if (h <= 0) {
        c = mix(rgb(0x6fe0d4), rgb(0x1d6fb0), smoothstep(0, -12, h));
      } else {
        let best = 0;
        for (let b = 1; b < 5; b++) if (T.biomeW[i * 5 + b] > T.biomeW[i * 5 + best]) best = b;
        c = BIOME_RGB[best];
        if (h < 2.6) c = mix(c, rgb(0xf0dca0), 1 - smoothstep(1, 2.6, h));
        const gx = H[i + 1] - H[i - 1];
        const gz = H[i + NV] - H[i - NV];
        const shade = clamp(1 + (-gx * 0.55 - gz * 0.45) * 0.035, 0.62, 1.28);
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
        const inLake = x > lakeBox.x0 && x < lakeBox.x1 && z > lakeBox.z0 && z < lakeBox.z1 && T.lakeRn(x, z) < 0.97;
        if (inLake || T.riverMargin(x, z) < -1) c = rgb(0x4cc9ea);
      }
      const o = (py * size + pxl) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const mx = (x) => ((x + HALF) / WORLD) * size;
  const mz = (z) => ((z + HALF) / WORLD) * size;
  const line = (pts, w, color) => {
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(mx(p.x), mz(p.z)) : ctx.moveTo(mx(p.x), mz(p.z))));
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  for (const r of T.roads) line(r.points, size / 380, 'rgba(255,255,255,0.85)');
  for (const lr of localRoads) line(lr.pts.map((p) => ({ x: p[0], z: p[1] })), size / 520, 'rgba(255,255,255,0.7)');

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const h of houses) ctx.fillRect(mx(h.x) - size / 900, mz(h.z) - size / 900, size / 430, size / 430);
  if (labels) {
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(size / 78)}px system-ui, sans-serif`;
    for (const p of landmarks) {
      if (p.minor) continue;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1b2735';
      ctx.lineWidth = size / 400;
      ctx.beginPath();
      ctx.arc(mx(p.x), mz(p.z), size / 170, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = size / 220;
      ctx.strokeText(p.name, mx(p.x), mz(p.z) - size / 100);
      ctx.fillText(p.name, mx(p.x), mz(p.z) - size / 100);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(size / 40)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#1b2735';
  ctx.lineWidth = 4;
  ctx.strokeText('SPLAT ISLAND', size / 50, size / 24);
  ctx.fillText('SPLAT ISLAND', size / 50, size / 24);
  ctx.textAlign = 'right';
  ctx.strokeText('N ↑', size - size / 50, size / 24);
  ctx.fillText('N ↑', size - size / 50, size / 24);
  void hexToLinear; void toSrgb;
  return canvas;
}

// World metres -> pixel position on a minimap of the given size.
export const worldToMap = (x, z, size) => [((x + HALF) / WORLD) * size, ((z + HALF) / WORLD) * size];

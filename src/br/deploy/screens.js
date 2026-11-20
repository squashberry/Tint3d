// In-world digital screens (canvas textures): ops wall, status boards, kiosks.

import * as THREE from 'three';
import { canvasTexture } from './effects.js';

const CYAN = '#20d8e9';
const CORAL = '#ff7652';
const AMBER = '#ffb42e';
const MAG = '#ff3fa4';
const FONT = '"Rajdhani","Bahnschrift","Arial Narrow",Arial,sans-serif';

function bg(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#07131c');
  g.addColorStop(1, '#0b1f2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(32,216,233,0.07)';
  ctx.lineWidth = 1;
  const s = Math.round(h / 12);
  for (let x = 0; x < w; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const sy = ((t * 0.35) % 1) * h;
  const sg = ctx.createLinearGradient(0, sy - 30, 0, sy + 30);
  sg.addColorStop(0, 'rgba(32,216,233,0)');
  sg.addColorStop(0.5, 'rgba(32,216,233,0.12)');
  sg.addColorStop(1, 'rgba(32,216,233,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, sy - 30, w, 60);
}
function frame(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, h / 90);
  const c = h / 8;
  ctx.beginPath();
  ctx.moveTo(6, c); ctx.lineTo(6, 6); ctx.lineTo(c, 6);
  ctx.moveTo(w - c, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, c);
  ctx.moveTo(6, h - c); ctx.lineTo(6, h - 6); ctx.lineTo(c, h - 6);
  ctx.moveTo(w - c, h - 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6, h - c);
  ctx.stroke();
}
function txt(ctx, s, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function bar(ctx, x, y, w, h, v, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
}

const DRAW = {
  wall(ctx, w, h, s, t) {
    bg(ctx, w, h, t);
    frame(ctx, w, h, CYAN);
    ctx.fillStyle = 'rgba(32,216,233,0.12)';
    ctx.fillRect(14, 14, w - 28, h * 0.14);
    txt(ctx, 'INKFORGE  //  BATTLE ROYALE OPERATIONS', 40, h * 0.085, h * 0.085, CYAN);
    txt(ctx, s.clock, w - 40, h * 0.085, h * 0.085, AMBER, 'right');
    txt(ctx, s.title, 48, h * 0.37, h * 0.17, '#ffffff');
    txt(ctx, s.sub, 52, h * 0.56, h * 0.075, CORAL);
    ctx.fillStyle = 'rgba(255,118,82,0.12)';
    ctx.fillRect(w * 0.66, h * 0.2, w * 0.31, h * 0.44);
    txt(ctx, s.countLabel, w * 0.815, h * 0.27, h * 0.06, CORAL, 'center');
    txt(ctx, s.count, w * 0.815, h * 0.45, h * 0.24, Math.floor(t * 2) % 2 && s.countUrgent ? '#ff3a3a' : '#ffffff', 'center');
    const chips = [['TRANSPORT', s.transport, s.transportColor || CYAN], ['BOARDING', s.boarding, s.boardingColor || CYAN], ['DEPLOYMENT', s.deployment, s.deploymentColor || CYAN]];
    chips.forEach((c, i) => {
      const x = 40 + i * (w * 0.31);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, h * 0.7, w * 0.29, h * 0.17);
      ctx.fillStyle = c[2];
      ctx.fillRect(x, h * 0.7, 8, h * 0.17);
      txt(ctx, c[0], x + 26, h * 0.745, h * 0.05, 'rgba(255,255,255,0.6)');
      txt(ctx, c[1], x + 26, h * 0.82, h * 0.075, c[2]);
    });
    bar(ctx, 40, h * 0.93, w - 80, h * 0.022, s.progress, CYAN);
  },
  status(ctx, w, h, s, t) {
    bg(ctx, w, h, t);
    frame(ctx, w, h, AMBER);
    txt(ctx, 'TRANSPORT  TX-01', 30, h * 0.12, h * 0.11, AMBER);
    txt(ctx, s.transport, 30, h * 0.3, h * 0.12, s.transportColor || CYAN);
    [['ALT', s.alt], ['SPD', s.speed], ['DIST', s.dist], ['GEAR', s.gear], ['RAMP', s.ramp]].forEach((r, i) => {
      txt(ctx, r[0], 30, h * (0.48 + i * 0.1), h * 0.075, 'rgba(255,255,255,0.55)');
      txt(ctx, r[1], w - 30, h * (0.48 + i * 0.1), h * 0.085, '#ffffff', 'right');
    });
  },
  ship(ctx, w, h, s, t) {
    bg(ctx, w, h, t);
    frame(ctx, w, h, CYAN);
    txt(ctx, 'INKFORGE  STATUS', 30, h * 0.12, h * 0.1, CYAN);
    const items = [['REACTOR', 0.93 + Math.sin(t) * 0.02, CYAN], ['HULL', 0.99, CYAN], ['INK RESERVE', 0.78 + Math.sin(t * 0.7) * 0.03, MAG], ['THRUST', 0.62 + Math.sin(t * 1.3) * 0.05, AMBER], ['DECK CREW', 0.88, CORAL]];
    items.forEach((it, i) => {
      txt(ctx, it[0], 30, h * (0.3 + i * 0.145), h * 0.065, 'rgba(255,255,255,0.7)');
      bar(ctx, w * 0.45, h * (0.28 + i * 0.145), w * 0.5, h * 0.055, it[1], it[2]);
    });
  },
  kiosk(ctx, w, h, s, t) {
    bg(ctx, w, h, t);
    frame(ctx, w, h, CORAL);
    txt(ctx, s.title, w / 2, h * 0.2, h * 0.11, '#ffffff', 'center');
    txt(ctx, s.sub, w / 2, h * 0.4, h * 0.075, CORAL, 'center');
    txt(ctx, s.count, w / 2, h * 0.68, h * 0.26, '#ffffff', 'center');
    txt(ctx, s.countLabel, w / 2, h * 0.9, h * 0.06, 'rgba(255,255,255,0.6)', 'center');
  },
  arrival(ctx, w, h, s, t) {
    bg(ctx, w, h, t);
    frame(ctx, w, h, CYAN);
    txt(ctx, 'ARRIVAL', 30, h * 0.2, h * 0.17, CYAN);
    txt(ctx, s.transport, 30, h * 0.5, h * 0.17, s.transportColor || '#ffffff');
    txt(ctx, 'ETA ' + s.eta, 30, h * 0.8, h * 0.17, AMBER);
  }
};

export class ScreenPanel {
  constructor(kind, width, height, { px = 1024, name = 'screen' } = {}) {
    this.kind = kind;
    const ph = Math.round(px * (height / width));
    const t = canvasTexture(px, ph);
    this.ctx = t.ctx;
    this.texture = t.texture;
    this.w = px;
    this.h = ph;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.name = name;
    this.acc = 1;
  }
  update(dt, state, t) {
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    DRAW[this.kind](this.ctx, this.w, this.h, state, t);
    this.texture.needsUpdate = true;
  }
}

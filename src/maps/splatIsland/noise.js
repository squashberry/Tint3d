// Small deterministic noise + math helpers (no dependencies).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

const GX = [1, -1, 1, -1, 1, -1, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1, -1];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function makeNoise(seed = 1) {
  const rand = mulberry32(seed);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];

  // Gradient noise, roughly in [-1, 1].
  function noise2(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const aa = p[p[X] + Y] & 7;
    const ab = p[p[X] + Y + 1] & 7;
    const ba = p[p[X + 1] + Y] & 7;
    const bb = p[p[X + 1] + Y + 1] & 7;
    const u = fade(xf);
    const v = fade(yf);
    const n00 = GX[aa] * xf + GY[aa] * yf;
    const n10 = GX[ba] * (xf - 1) + GY[ba] * yf;
    const n01 = GX[ab] * xf + GY[ab] * (yf - 1);
    const n11 = GX[bb] * (xf - 1) + GY[bb] * (yf - 1);
    const x1 = n00 + (n10 - n00) * u;
    const x2 = n01 + (n11 - n01) * u;
    return (x1 + (x2 - x1) * v) * 0.85;
  }

  // Fractal sum normalised to roughly [-1, 1].
  function fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += noise2(x * f + i * 17.3, y * f - i * 9.1) * amp;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  // Ridged fractal in [0, 1] — sharp mountain crests.
  function ridged(x, y, octaves = 4) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise2(x * f + i * 5.7, y * f + i * 3.3));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }

  return { noise2, fbm, ridged };
}

export function hexToLinear(hex) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

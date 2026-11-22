// Original lobby artwork (inline SVG). Everything here is hand-authored for Tint3d.

const SPLAT = (cx, cy, r, fill, rot = 0) => `<g transform="translate(${cx} ${cy}) rotate(${rot})"><path fill="${fill}" d="M0 ${-r}c${r * 0.35} ${-r * 0.1} ${r * 0.62} ${r * 0.05} ${r * 0.72} ${r * 0.34}c${r * 0.2} ${r * 0.1} ${r * 0.38} ${r * 0.35} ${r * 0.18} ${r * 0.62}c${r * 0.16} ${r * 0.3} ${-r * 0.1} ${r * 0.62} ${-r * 0.42} ${r * 0.55}c${-r * 0.2} ${r * 0.35} ${-r * 0.7} ${r * 0.3} ${-r * 0.78} ${-r * 0.06}c${-r * 0.34} ${-r * 0.08} ${-r * 0.5} ${-r * 0.5} ${-r * 0.2} ${-r * 0.74}c${r * 0.02} ${-r * 0.2} ${r * 0.28} ${-r * 0.55} ${r * 0.5} ${-r * 0.7}z"/><circle cx="${r * 1.05}" cy="${-r * 0.5}" r="${r * 0.14}" fill="${fill}"/><circle cx="${-r * 0.95}" cy="${r * 0.7}" r="${r * 0.1}" fill="${fill}"/></g>`;

const UMBRELLA = (x, y, s, c1, c2, cls) => `<g class="lb-sway ${cls}" transform="translate(${x} ${y}) scale(${s})"><g>
  <path d="M-48 0Q-40 -44 0 -48Q40 -44 48 0Q36 -9 24 0Q12 -9 0 0Q-12 -9 -24 0Q-36 -9 -48 0Z" fill="${c1}"/>
  <path d="M-24 0Q-20 -40 0 -48Q-6 -26 0 0Q-12 -9 -24 0Z" fill="${c2}" opacity=".9"/><path d="M24 0Q20 -40 0 -48Q6 -26 0 0Q12 -9 24 0Z" fill="${c2}" opacity=".9"/>
  <path d="M0 -48V46" stroke="#e9f4f6" stroke-width="2.4"/><path d="M-30 -2L0 18M30 -2L0 18M-14 -4L0 18M14 -4L0 18" stroke="#cfe3e8" stroke-width="1.3" fill="none"/>
  <rect x="-3" y="44" width="6" height="14" rx="3" fill="#0d1a22" stroke="#e9f4f6" stroke-width="1.4"/>
  <circle cx="-48" cy="0" r="2.6" fill="#fff"/><circle cx="48" cy="0" r="2.6" fill="#fff"/></g></g>`;

export const ART = {
  br: () => `<svg viewBox="0 0 640 440" class="lb-art-svg" aria-hidden="true">
  <defs>
    <linearGradient id="lbSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#143a5a"/><stop offset=".55" stop-color="#e98a6b"/><stop offset="1" stop-color="#ffd7a1"/></linearGradient>
    <linearGradient id="lbSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1aa7b8"/><stop offset="1" stop-color="#0a3556"/></linearGradient>
    <linearGradient id="lbIsl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ee86a"/><stop offset="1" stop-color="#2f8a56"/></linearGradient>
    <clipPath id="lbFrame"><path d="M30 0H640V400L600 440H0V40Z"/></clipPath>
  </defs>
  <g clip-path="url(#lbFrame)">
    <rect width="640" height="440" fill="url(#lbSky)"/>
    <circle cx="470" cy="150" r="52" fill="#fff3c9" opacity=".92"/><circle cx="470" cy="150" r="90" fill="#ffd9a0" opacity=".25"/>
    <g fill="#fff" opacity=".6"><ellipse cx="120" cy="90" rx="70" ry="14"/><ellipse cx="170" cy="78" rx="46" ry="12"/><ellipse cx="420" cy="60" rx="80" ry="13"/><ellipse cx="560" cy="108" rx="52" ry="10"/></g>
    <rect y="262" width="640" height="190" fill="url(#lbSea)"/>
    <g class="lb-waves" stroke="#bff6ff" stroke-width="2" fill="none" opacity=".55"><path d="M0 290q40 -12 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0"/><path d="M-40 330q40 -12 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0"/><path d="M0 372q40 -12 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0"/></g>
    <path d="M390 266q18 -60 70 -66q26 -26 64 -6q40 -14 76 20q22 18 40 52z" fill="url(#lbIsl)"/>
    <path d="M430 262q30 -36 70 -34q30 -14 60 6q30 8 52 28z" fill="#2f8a56" opacity=".7"/>
    <path d="M520 214l18 -34l14 22l12 -16l16 28z" fill="#e9f2f6"/>
    <path d="M388 268q20 8 60 4t120 0t112 -4v10H388z" fill="#f2d99a"/>
    <g><path d="M28 292H318l30 -10v-18H70z" fill="#0f1c26"/><path d="M60 264H336l-8 -12H92z" fill="#26384a"/><rect x="226" y="236" width="42" height="28" fill="#2c4256"/><rect x="236" y="222" width="22" height="14" fill="#3a5670"/><path d="M247 222v-26" stroke="#9fb6c4" stroke-width="2"/><rect x="232" y="244" width="30" height="5" fill="#20d8e9"/>
      <g fill="#ffb42e"><circle cx="98" cy="262" r="2"/><circle cx="124" cy="262" r="2"/><circle cx="150" cy="262" r="2"/><circle cx="176" cy="262" r="2"/><circle cx="202" cy="262" r="2"/><circle cx="296" cy="262" r="2"/></g>
      <path d="M0 296q120 12 300 0" stroke="#e9fbff" stroke-width="5" opacity=".55" fill="none"/></g>
    <g class="lb-fly"><path d="M-48 0l54 -4l26 -10l8 3l-12 12l14 12l-8 3l-26 -9l-56 -3z" fill="#eaf1f5"/><path d="M-48 0l-14 -16l6 -1l18 12z" fill="#ff7652"/><path d="M-40 -1h70" stroke="#20d8e9" stroke-width="3"/><circle cx="26" cy="-3" r="3" fill="#20d8e9"/>
      <path d="M-50 2q-70 -2 -140 14" stroke="#fff" stroke-width="3" opacity=".6" fill="none" stroke-dasharray="10 8"/></g>
    ${UMBRELLA(250, 150, 0.9, '#20d8e9', '#f2f6fa', 's1')}${UMBRELLA(330, 205, 0.7, '#ff7652', '#f2f6fa', 's2')}${UMBRELLA(160, 190, 0.6, '#ff3fa4', '#2a1a3a', 's3')}
    ${SPLAT(80, 380, 26, '#20d8e9', 10)}${SPLAT(560, 396, 20, '#ff7652', -20)}${SPLAT(330, 410, 14, '#ff3fa4', 30)}
  </g></svg>`,

  clash: () => `<svg viewBox="0 0 640 440" class="lb-art-svg" aria-hidden="true">
  <defs><clipPath id="lbF2"><path d="M30 0H640V400L600 440H0V40Z"/></clipPath><pattern id="lbGrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#ffffff22" stroke-width="1"/></pattern></defs>
  <g clip-path="url(#lbF2)"><rect width="640" height="440" fill="#0e2a3a"/><rect width="640" height="440" fill="url(#lbGrid)"/>
    <rect x="90" y="40" width="460" height="360" rx="18" fill="#12384a" stroke="#cdeff2" stroke-opacity=".5" stroke-width="3"/>
    <path d="M90 220H550" stroke="#fff" stroke-opacity=".35" stroke-dasharray="10 10" stroke-width="2"/><circle cx="320" cy="220" r="42" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
    <path d="M92 400V300q60 -40 110 -10q60 -30 120 6q70 -22 130 4q50 -14 96 6V400z" fill="#20d8e9" opacity=".78"/>
    <path d="M92 42V130q50 24 100 4q70 30 130 -6q60 18 120 -2q60 20 106 -4V42z" fill="#ff7652" opacity=".78"/>
    <g fill="#e9fbff"><rect x="210" y="170" width="26" height="46" rx="4" opacity=".9"/><rect x="380" y="240" width="40" height="22" rx="4" opacity=".9"/><rect x="290" y="300" width="58" height="12" rx="3" opacity=".9"/></g>
    ${[[160, 360], [250, 330], [330, 372], [410, 340], [490, 362]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#a4f7ff" stroke="#063b50" stroke-width="3"/>`).join('')}
    ${[[150, 84], [240, 100], [320, 70], [410, 98], [500, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#ffd0a9" stroke="#54212c" stroke-width="3"/>`).join('')}
    <path d="M330 340L320 130" stroke="#20d8e9" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>
    ${SPLAT(320, 214, 22, '#20d8e9', 5)}${SPLAT(470, 150, 16, '#ff7652', 40)}${SPLAT(150, 270, 14, '#ff7652', -30)}
  </g></svg>`,

  ranked: () => `<svg viewBox="0 0 640 440" class="lb-art-svg" aria-hidden="true">
  <defs><clipPath id="lbF3"><path d="M30 0H640V400L600 440H0V40Z"/></clipPath><linearGradient id="lbR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3fa4"/><stop offset="1" stop-color="#7b61ff"/></linearGradient></defs>
  <g clip-path="url(#lbF3)"><rect width="640" height="440" fill="#1a1030"/>
    <g opacity=".5" stroke="#ff3fa4" stroke-width="2" fill="none"><circle cx="320" cy="220" r="150"/><circle cx="320" cy="220" r="200"/><circle cx="320" cy="220" r="250"/></g>
    <path d="M320 70l120 40v100q0 90 -120 150q-120 -60 -120 -150V110z" fill="url(#lbR)" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>
    <path d="M250 190l70 -46l70 46M250 238l70 -46l70 46M250 286l70 -46l70 46" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".9"/>
    ${SPLAT(500, 120, 22, '#ffb42e', 20)}${SPLAT(130, 340, 18, '#20d8e9', -10)}
  </g></svg>`,

  tourney: () => `<svg viewBox="0 0 640 440" class="lb-art-svg" aria-hidden="true">
  <defs><clipPath id="lbF4"><path d="M30 0H640V400L600 440H0V40Z"/></clipPath><linearGradient id="lbT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd25a"/><stop offset="1" stop-color="#ff7a3a"/></linearGradient></defs>
  <g clip-path="url(#lbF4)"><rect width="640" height="440" fill="#2a1a10"/>
    <g stroke="#ffb42e" stroke-width="3" fill="none" opacity=".6"><path d="M80 90h90v60h90M80 210h90v-60M80 270h90v60h90M80 390h90v-60M260 150h60v120h-60M560 90h-90v60h-90M560 210h-90v-60M560 270h-90v60h-90M560 390h-90v-60M380 150h-60"/></g>
    <path d="M250 110h140v70q0 70 -70 90q-70 -20 -70 -90z" fill="url(#lbT)"/><path d="M250 124h-40q0 50 44 70M390 124h40q0 50 -44 70" stroke="#ffd25a" stroke-width="10" fill="none"/>
    <rect x="300" y="262" width="40" height="40" fill="#ffb42e"/><rect x="262" y="302" width="116" height="26" rx="6" fill="#ff7a3a"/>
    ${SPLAT(130, 90, 20, '#ff3fa4', 0)}${SPLAT(520, 340, 22, '#20d8e9', 30)}
  </g></svg>`
};

export const ICON = {
  br: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 20q18 -22 36 0q-6 -4 -12 0q-6 -4 -12 0q-6 -4 -12 0z" fill="currentColor"/><path d="M24 14V38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M24 38q0 6 6 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  clash: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 38L24 6l16 32H28l-4 -8l-4 8z" fill="currentColor"/><circle cx="24" cy="28" r="3" fill="#0b1620"/></svg>`,
  ranked: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l16 6v12q0 12 -16 22q-16 -10 -16 -22V10z" fill="currentColor"/><path d="M15 22l9 -6l9 6M15 29l9 -6l9 6" stroke="#0b1620" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  tourney: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 6h20v12q0 10 -10 12q-10 -2 -10 -12z" fill="currentColor"/><path d="M14 10H6q0 10 8 12M34 10h8q0 10 -8 12" stroke="currentColor" stroke-width="3" fill="none"/><rect x="21" y="30" width="6" height="8" fill="currentColor"/><rect x="14" y="38" width="20" height="5" rx="2" fill="currentColor"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" stroke-width="2.4" fill="none"/></svg>`
};

export function emblem(name, hue = 190) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = (h % 360);
  const initials = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'T3';
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lbE${h}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 90% 60%)"/><stop offset="1" stop-color="hsl(${(a + 70) % 360} 85% 48%)"/></linearGradient></defs>
  <path d="M32 3C42 18 56 26 56 40a24 24 0 01-48 0C8 26 22 18 32 3z" fill="url(#lbE${h})" stroke="#fff" stroke-opacity=".75" stroke-width="2.5"/>
  <text x="32" y="43" text-anchor="middle" font-family="'Barlow Condensed',sans-serif" font-weight="900" font-size="22" fill="#08141c">${initials}</text></svg>`;
}
